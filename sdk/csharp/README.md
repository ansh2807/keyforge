# Keyforge .NET SDK

Reference `Keyforge.Client.csproj` or pack it with `dotnet pack`. The client targets .NET 8 and uses NSec for Ed25519 response verification.

```csharp
using Keyforge.Client;

using var client = new KeyforgeClient(new KeyforgeOptions(
    "https://auth.company.test",
    "app_public_id",
    File.ReadAllText("keyforge-public.pem"),
    "stable-device-identifier"));

var session = await client.ActivateAsync("KF-XXXX-XXXX-XXXX-XXXX");
var configuration = await client.ConfigurationAsync();
await client.HeartbeatAsync();
```

Signed JSON is canonicalized, verified with Ed25519, and checked against the request nonce. Managed-file downloads are verified with SHA-256.
