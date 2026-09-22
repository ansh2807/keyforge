# Keyforge C++ SDK

The client requires C++20, OpenSSL 3, libcurl, and nlohmann/json. Configure and build with CMake.

```cpp
keyforge::client client({
    .base_url = "https://auth.company.test",
    .app_id = "app_public_id",
    .public_key_pem = public_key_pem,
    .installation_id = "stable-device-identifier"
});

auto session = client.activate("KF-XXXX-XXXX-XXXX-XXXX");
auto configuration = client.configuration();
client.heartbeat();
```

The SDK verifies Ed25519 signatures and nonces. Protected downloads are returned only after SHA-256 verification.
