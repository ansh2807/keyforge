# Keyforge Python SDK

Install the local package with `pip install ./sdk/python`. Obtain the application ID and Ed25519 public key from the Keyforge application overview.

```python
from keyforge import KeyforgeClient

client = KeyforgeClient(
    base_url="https://auth.example.com",
    app_id="app_public_id",
    public_key_pem="""-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAexamplebase64publickeymaterial=
-----END PUBLIC KEY-----""",
    installation_id="stable-device-identifier",
)

session = client.activate("KF-XXXX-XXXX-XXXX-XXXX")
config = client.configuration()
client.heartbeat()
```

Every signed JSON response is verified with Ed25519 and bound to the request nonce. Protected downloads are verified with SHA-256 before being returned.
