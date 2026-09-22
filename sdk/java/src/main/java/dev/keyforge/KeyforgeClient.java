package dev.keyforge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Duration;
import java.util.Base64;
import java.util.Iterator;
import java.util.Map;
import java.util.TreeMap;

public final class KeyforgeClient {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final SecureRandom RANDOM = new SecureRandom();

    private final HttpClient http;
    private final String baseUrl;
    private final String appId;
    private final String installationId;
    private final String installationLabel;
    private final String clientVersion;
    private final PublicKey publicKey;
    private String sessionToken;

    public KeyforgeClient(String baseUrl, String appId, String publicKeyPem, String installationId, String installationLabel, String clientVersion) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.appId = appId;
        this.installationId = installationId;
        this.installationLabel = installationLabel;
        this.clientVersion = clientVersion;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        try {
            String encoded = publicKeyPem.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replaceAll("\\s", "");
            this.publicKey = KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(encoded)));
        } catch (Exception error) {
            throw new IllegalArgumentException("publicKeyPem must contain an Ed25519 public key", error);
        }
    }

    public void restoreSession(String token) {
        if (token == null || token.length() < 30) throw new KeyforgeException("invalid_session", "The session token is malformed.", 400);
        this.sessionToken = token;
    }

    private String requireSession() {
        if (sessionToken == null) throw new KeyforgeException("missing_session", "No client session is active.", 400);
        return sessionToken;
    }

    private static String nonce() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private ObjectNode activationFields(String requestNonce) {
        ObjectNode body = JSON.createObjectNode();
        body.put("installationId", installationId);
        if (installationLabel != null) body.put("installationLabel", installationLabel);
        if (clientVersion != null) body.put("clientVersion", clientVersion);
        body.put("nonce", requestNonce);
        return body;
    }

    private static JsonNode sorted(JsonNode value) {
        if (value.isObject()) {
            ObjectNode result = JSON.createObjectNode();
            TreeMap<String, JsonNode> fields = new TreeMap<>();
            Iterator<Map.Entry<String, JsonNode>> iterator = value.fields();
            iterator.forEachRemaining(field -> fields.put(field.getKey(), field.getValue()));
            fields.forEach((key, nested) -> result.set(key, sorted(nested)));
            return result;
        }
        if (value.isArray()) {
            ArrayNode result = JSON.createArrayNode();
            value.forEach(item -> result.add(sorted(item)));
            return result;
        }
        return value;
    }

    private JsonNode postVerified(String path, ObjectNode body) {
        body.put("appId", appId);
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
            .timeout(Duration.ofSeconds(20))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
            .build();
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            JsonNode root = JSON.readTree(response.body());
            if (!root.path("success").asBoolean(false)) {
                JsonNode error = root.path("error");
                throw new KeyforgeException(error.path("code").asText("request_failed"), error.path("message").asText("The Keyforge request failed."), response.statusCode());
            }
            if (!"Ed25519".equals(root.path("algorithm").asText())) throw new KeyforgeException("invalid_signature_algorithm", "The response algorithm is not supported.", 502);
            JsonNode data = root.get("data");
            byte[] signedPayload = Base64.getUrlDecoder().decode(root.path("signedPayload").asText());
            Signature verifier = Signature.getInstance("Ed25519");
            verifier.initVerify(publicKey);
            verifier.update(signedPayload);
            if (!verifier.verify(Base64.getUrlDecoder().decode(root.path("signature").asText()))) throw new KeyforgeException("invalid_signature", "The server response signature is invalid.", 502);
            if (!JSON.readTree(signedPayload).equals(data)) throw new KeyforgeException("signed_payload_mismatch", "The response data does not match its signed payload.", 502);
            if (body.has("nonce") && !body.path("nonce").asText().equals(data.path("nonce").asText())) throw new KeyforgeException("nonce_mismatch", "The server response did not match this request.", 502);
            return data.deepCopy();
        } catch (KeyforgeException error) {
            throw error;
        } catch (IOException error) {
            throw new KeyforgeException("network_error", error.getMessage(), 0);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new KeyforgeException("interrupted", "The Keyforge request was interrupted.", 0);
        } catch (Exception error) {
            throw new KeyforgeException("invalid_response", error.getMessage(), 502);
        }
    }

    public JsonNode activate(String licenseKey) {
        ObjectNode body = activationFields(nonce());
        body.put("licenseKey", licenseKey);
        JsonNode data = postVerified("/api/v1/client/activate", body);
        sessionToken = data.path("sessionToken").asText();
        return data;
    }

    public JsonNode register(String licenseKey, String username, String password, String email) {
        ObjectNode body = activationFields(nonce());
        body.put("licenseKey", licenseKey);
        body.put("username", username);
        body.put("password", password);
        if (email != null) body.put("email", email);
        JsonNode data = postVerified("/api/v1/client/register", body);
        sessionToken = data.path("sessionToken").asText();
        return data;
    }

    public JsonNode login(String username, String password, String totp) {
        ObjectNode body = activationFields(nonce());
        body.put("username", username);
        body.put("password", password);
        if (totp != null) body.put("totp", totp);
        JsonNode data = postVerified("/api/v1/client/login", body);
        sessionToken = data.path("sessionToken").asText();
        return data;
    }

    private ObjectNode sessionBody() {
        ObjectNode body = JSON.createObjectNode();
        body.put("sessionToken", requireSession());
        body.put("nonce", nonce());
        return body;
    }

    public JsonNode validate() { return postVerified("/api/v1/client/validate", sessionBody()); }
    public JsonNode heartbeat() { return postVerified("/api/v1/client/heartbeat", sessionBody()); }
    public JsonNode configuration() { return postVerified("/api/v1/client/config", sessionBody()); }

    public JsonNode callFunction(String name, JsonNode input) {
        ObjectNode body = sessionBody();
        body.set("input", input == null ? JSON.nullNode() : input);
        return postVerified("/api/v1/client/functions/" + URLEncoder.encode(name, StandardCharsets.UTF_8).replace("+", "%20"), body).get("response");
    }

    public JsonNode files() { return postVerified("/api/v1/client/files", sessionBody()).get("files"); }

    public byte[] downloadFile(JsonNode file) {
        ObjectNode body = sessionBody();
        body.put("appId", appId);
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + file.path("downloadPath").asText()))
            .timeout(Duration.ofSeconds(30))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
            .build();
        try {
            HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw new KeyforgeException("download_failed", "Protected file download returned HTTP " + response.statusCode() + ".", response.statusCode());
            String actual = java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(response.body()));
            if (!actual.equalsIgnoreCase(file.path("sha256").asText())) throw new KeyforgeException("file_hash_mismatch", "The downloaded file failed SHA-256 verification.", 502);
            return response.body();
        } catch (KeyforgeException error) {
            throw error;
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new KeyforgeException("interrupted", "The file download was interrupted.", 0);
        } catch (Exception error) {
            throw new KeyforgeException("download_failed", error.getMessage(), 0);
        }
    }

    public JsonNode getUserVariable(String key) {
        ObjectNode body = sessionBody();
        body.put("key", key);
        return postVerified("/api/v1/client/user-variables", body);
    }

    public JsonNode setUserVariable(String key, String value) {
        ObjectNode body = sessionBody();
        body.put("key", key);
        body.put("value", value);
        return postVerified("/api/v1/client/user-variables", body);
    }

    public JsonNode chat(String channel, String message, String after) {
        ObjectNode body = sessionBody();
        body.put("channel", channel);
        if (message != null) body.put("message", message);
        if (after != null) body.put("after", after);
        return postVerified("/api/v1/client/chat", body).get("messages");
    }

    public JsonNode beginTotp() { return postVerified("/api/v1/client/totp/begin", sessionBody()); }

    public void confirmTotp(String token) {
        ObjectNode body = sessionBody();
        body.put("token", token);
        postVerified("/api/v1/client/totp/confirm", body);
    }

    public void deactivate() {
        if (sessionToken == null) return;
        ObjectNode body = JSON.createObjectNode();
        body.put("appId", appId);
        body.put("sessionToken", sessionToken);
        sessionToken = null;
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/api/v1/client/deactivate"))
            .timeout(Duration.ofSeconds(20))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
            .build();
        try {
            HttpResponse<Void> response = http.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw new KeyforgeException("deactivate_failed", "Session deactivation failed.", response.statusCode());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new KeyforgeException("interrupted", "Session deactivation was interrupted.", 0);
        } catch (IOException error) {
            throw new KeyforgeException("network_error", error.getMessage(), 0);
        }
    }
}
