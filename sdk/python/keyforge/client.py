from __future__ import annotations

import base64
import hashlib
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from cryptography.hazmat.primitives.serialization import load_pem_public_key
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


class KeyforgeError(RuntimeError):
    def __init__(self, code: str, message: str, status: int) -> None:
        super().__init__(message)
        self.code = code
        self.status = status


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _base64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


@dataclass(frozen=True)
class ClientOptions:
    base_url: str
    app_id: str
    public_key_pem: str
    installation_id: str
    installation_label: str | None = None
    client_version: str | None = None
    timeout_seconds: float = 20.0


class KeyforgeClient:
    def __init__(
        self,
        *,
        base_url: str,
        app_id: str,
        public_key_pem: str,
        installation_id: str,
        installation_label: str | None = None,
        client_version: str | None = None,
        timeout_seconds: float = 20.0,
    ) -> None:
        self.options = ClientOptions(
            base_url=base_url.rstrip("/"),
            app_id=app_id,
            public_key_pem=public_key_pem,
            installation_id=installation_id,
            installation_label=installation_label,
            client_version=client_version,
            timeout_seconds=timeout_seconds,
        )
        public_key = load_pem_public_key(public_key_pem.encode("ascii"))
        if not isinstance(public_key, Ed25519PublicKey):
            raise ValueError("public_key_pem must contain an Ed25519 public key")
        self._public_key = public_key
        self._session_token: str | None = None

    @staticmethod
    def _nonce() -> str:
        return secrets.token_urlsafe(24)

    def restore_session(self, session_token: str) -> None:
        if len(session_token) < 30:
            raise KeyforgeError("invalid_session", "The session token is malformed.", 400)
        self._session_token = session_token

    def _require_session(self) -> str:
        if not self._session_token:
            raise KeyforgeError("missing_session", "No client session is active.", 400)
        return self._session_token

    def _request_json(self, path: str, body: dict[str, Any], *, verify_signature: bool = True) -> dict[str, Any]:
        clean_body = {key: value for key, value in body.items() if value is not None}
        encoded = json.dumps({"appId": self.options.app_id, **clean_body}, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            f"{self.options.base_url}{path}",
            data=encoded,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        status = 0
        try:
            with urllib.request.urlopen(request, timeout=self.options.timeout_seconds) as response:
                status = response.status
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            status = error.code
            try:
                payload = json.loads(error.read().decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                raise KeyforgeError("http_error", f"Keyforge returned HTTP {status}.", status) from error
        except urllib.error.URLError as error:
            raise KeyforgeError("network_error", str(error.reason), 0) from error
        if not payload.get("success"):
            problem = payload.get("error") or {}
            raise KeyforgeError(problem.get("code", "request_failed"), problem.get("message", "The request failed."), status)
        data = payload.get("data")
        if not isinstance(data, dict):
            if verify_signature:
                raise KeyforgeError("invalid_response", "The response data is invalid.", 502)
            return {}
        if verify_signature:
            if payload.get("algorithm") != "Ed25519":
                raise KeyforgeError("invalid_signature_algorithm", "The response algorithm is not supported.", 502)
            try:
                signed_payload = _base64url_decode(payload["signedPayload"])
                self._public_key.verify(_base64url_decode(payload["signature"]), signed_payload)
                if json.loads(signed_payload.decode("utf-8")) != data:
                    raise ValueError("signed payload mismatch")
            except Exception as error:
                raise KeyforgeError("invalid_signature", "The server response signature is invalid.", 502) from error
        expected_nonce = clean_body.get("nonce")
        if expected_nonce and data.get("nonce") != expected_nonce:
            raise KeyforgeError("nonce_mismatch", "The server response did not match this request.", 502)
        return data

    def _activation_fields(self, nonce: str) -> dict[str, Any]:
        return {
            "installationId": self.options.installation_id,
            "installationLabel": self.options.installation_label,
            "clientVersion": self.options.client_version,
            "nonce": nonce,
        }

    def activate(self, license_key: str) -> dict[str, Any]:
        request_nonce = self._nonce()
        data = self._request_json("/api/v1/client/activate", {"licenseKey": license_key, **self._activation_fields(request_nonce)})
        self._session_token = str(data["sessionToken"])
        return data

    def register(self, *, license_key: str, username: str, password: str, email: str | None = None) -> dict[str, Any]:
        request_nonce = self._nonce()
        data = self._request_json("/api/v1/client/register", {"licenseKey": license_key, "username": username, "password": password, "email": email, **self._activation_fields(request_nonce)})
        self._session_token = str(data["sessionToken"])
        return data

    def login(self, username: str, password: str, *, totp: str | None = None) -> dict[str, Any]:
        request_nonce = self._nonce()
        data = self._request_json("/api/v1/client/login", {"username": username, "password": password, "totp": totp, **self._activation_fields(request_nonce)})
        self._session_token = str(data["sessionToken"])
        return data

    def validate(self) -> dict[str, Any]:
        return self._request_json("/api/v1/client/validate", {"sessionToken": self._require_session(), "nonce": self._nonce()})

    def heartbeat(self) -> dict[str, Any]:
        return self._request_json("/api/v1/client/heartbeat", {"sessionToken": self._require_session(), "nonce": self._nonce()})

    def configuration(self) -> dict[str, Any]:
        return self._request_json("/api/v1/client/config", {"sessionToken": self._require_session(), "nonce": self._nonce()})

    def call_function(self, name: str, input_value: Any = None) -> Any:
        data = self._request_json(f"/api/v1/client/functions/{urllib.parse.quote(name, safe='')}", {"sessionToken": self._require_session(), "nonce": self._nonce(), "input": input_value})
        return data.get("response")

    def files(self) -> list[dict[str, Any]]:
        data = self._request_json("/api/v1/client/files", {"sessionToken": self._require_session(), "nonce": self._nonce()})
        return list(data.get("files") or [])

    def download_file(self, file: dict[str, Any]) -> bytes:
        body = json.dumps({"appId": self.options.app_id, "sessionToken": self._require_session(), "nonce": self._nonce()}).encode("utf-8")
        request = urllib.request.Request(f"{self.options.base_url}{file['downloadPath']}", data=body, headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=self.options.timeout_seconds) as response:
                content = response.read()
        except urllib.error.HTTPError as error:
            raise KeyforgeError("download_failed", f"Protected file download returned HTTP {error.code}.", error.code) from error
        if hashlib.sha256(content).hexdigest() != str(file["sha256"]).lower():
            raise KeyforgeError("file_hash_mismatch", "The downloaded file failed SHA-256 verification.", 502)
        return content

    def get_user_variable(self, key: str) -> str | None:
        data = self._request_json("/api/v1/client/user-variables", {"sessionToken": self._require_session(), "nonce": self._nonce(), "key": key})
        return data.get("value")

    def set_user_variable(self, key: str, value: str) -> str:
        data = self._request_json("/api/v1/client/user-variables", {"sessionToken": self._require_session(), "nonce": self._nonce(), "key": key, "value": value})
        return str(data["value"])

    def chat(self, channel: str, *, message: str | None = None, after: str | None = None) -> list[dict[str, Any]]:
        data = self._request_json("/api/v1/client/chat", {"sessionToken": self._require_session(), "nonce": self._nonce(), "channel": channel, "message": message, "after": after})
        return list(data.get("messages") or [])

    def begin_totp(self) -> dict[str, Any]:
        return self._request_json("/api/v1/client/totp/begin", {"sessionToken": self._require_session(), "nonce": self._nonce()})

    def confirm_totp(self, token: str) -> None:
        self._request_json("/api/v1/client/totp/confirm", {"sessionToken": self._require_session(), "nonce": self._nonce(), "token": token})

    def deactivate(self) -> None:
        if not self._session_token:
            return
        token = self._session_token
        self._session_token = None
        self._request_json("/api/v1/client/deactivate", {"sessionToken": token}, verify_signature=False)
