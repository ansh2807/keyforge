# Keyforge Java SDK

Build with `mvn package`. The SDK requires Java 17 and uses the JDK Ed25519 implementation plus Jackson for JSON processing.

```java
KeyforgeClient client = new KeyforgeClient(
    "https://auth.company.test",
    "app_public_id",
    Files.readString(Path.of("keyforge-public.pem")),
    "stable-device-identifier",
    "Workstation",
    "1.0.0"
);

JsonNode session = client.activate("KF-XXXX-XXXX-XXXX-XXXX");
JsonNode configuration = client.configuration();
client.heartbeat();
```

The SDK verifies Ed25519 signatures, request nonces, and SHA-256 file hashes.
