using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using NSec.Cryptography;

namespace Keyforge.Client;

public sealed class KeyforgeException(string code, string message, int statusCode) : Exception(message)
{
    public string Code { get; } = code;
    public int StatusCode { get; } = statusCode;
}

public sealed record KeyforgeOptions(
    string BaseUrl,
    string AppId,
    string PublicKeyPem,
    string InstallationId,
    string? InstallationLabel = null,
    string? ClientVersion = null);

public sealed class KeyforgeClient : IDisposable
{
    private readonly HttpClient _http;
    private readonly bool _ownsHttp;
    private readonly KeyforgeOptions _options;
    private readonly PublicKey _publicKey;
    private string? _sessionToken;

    public KeyforgeClient(KeyforgeOptions options, HttpClient? httpClient = null)
    {
        _options = options with { BaseUrl = options.BaseUrl.TrimEnd('/') };
        _ownsHttp = httpClient is null;
        _http = httpClient ?? new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        var der = Convert.FromBase64String(string.Concat(
            options.PublicKeyPem.Split('\n', StringSplitOptions.RemoveEmptyEntries)
                .Select(line => line.Trim())
                .Where(line => !line.StartsWith("-----", StringComparison.Ordinal))));
        _publicKey = PublicKey.Import(SignatureAlgorithm.Ed25519, der, KeyBlobFormat.PkixPublicKey);
    }

    public void RestoreSession(string sessionToken)
    {
        if (sessionToken.Length < 30) throw new KeyforgeException("invalid_session", "The session token is malformed.", 400);
        _sessionToken = sessionToken;
    }

    private string RequireSession() => _sessionToken ?? throw new KeyforgeException("missing_session", "No client session is active.", 400);

    private static string Nonce() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private Dictionary<string, object?> ActivationFields(string nonce) => new()
    {
        ["installationId"] = _options.InstallationId,
        ["installationLabel"] = _options.InstallationLabel,
        ["clientVersion"] = _options.ClientVersion,
        ["nonce"] = nonce,
    };

    private static byte[] CanonicalJson(JsonElement element)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream)) WriteCanonical(writer, element);
        return stream.ToArray();
    }

    private static void WriteCanonical(Utf8JsonWriter writer, JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                writer.WriteStartObject();
                foreach (var property in element.EnumerateObject().OrderBy(property => property.Name, StringComparer.Ordinal))
                {
                    writer.WritePropertyName(property.Name);
                    WriteCanonical(writer, property.Value);
                }
                writer.WriteEndObject();
                break;
            case JsonValueKind.Array:
                writer.WriteStartArray();
                foreach (var item in element.EnumerateArray()) WriteCanonical(writer, item);
                writer.WriteEndArray();
                break;
            default:
                element.WriteTo(writer);
                break;
        }
    }

    private async Task<JsonElement> PostVerifiedAsync(string path, Dictionary<string, object?> body, CancellationToken cancellationToken = default)
    {
        foreach (var key in body.Where(entry => entry.Value is null).Select(entry => entry.Key).ToArray()) body.Remove(key);
        body["appId"] = _options.AppId;
        using var response = await _http.PostAsJsonAsync($"{_options.BaseUrl}{path}", body, cancellationToken);
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (!root.TryGetProperty("success", out var success) || !success.GetBoolean())
        {
            var code = "request_failed";
            var message = "The Keyforge request failed.";
            if (root.TryGetProperty("error", out var error))
            {
                if (error.TryGetProperty("code", out var errorCode)) code = errorCode.GetString() ?? code;
                if (error.TryGetProperty("message", out var errorMessage)) message = errorMessage.GetString() ?? message;
            }
            throw new KeyforgeException(code, message, (int)response.StatusCode);
        }
        var algorithm = root.GetProperty("algorithm").GetString();
        if (algorithm != "Ed25519") throw new KeyforgeException("invalid_signature_algorithm", "The response algorithm is not supported.", 502);
        var data = root.GetProperty("data");
        var signedPayload = Convert.FromBase64String(root.GetProperty("signedPayload").GetString()!.Replace('-', '+').Replace('_', '/').PadRight((root.GetProperty("signedPayload").GetString()!.Length + 3) / 4 * 4, '='));
        var signature = Convert.FromBase64String(root.GetProperty("signature").GetString()!.Replace('-', '+').Replace('_', '/').PadRight((root.GetProperty("signature").GetString()!.Length + 3) / 4 * 4, '='));
        if (!SignatureAlgorithm.Ed25519.Verify(_publicKey, signedPayload, signature))
            throw new KeyforgeException("invalid_signature", "The server response signature is invalid.", 502);
        var signedData = JsonNode.Parse(signedPayload);
        var responseData = JsonNode.Parse(data.GetRawText());
        if (!JsonNode.DeepEquals(signedData, responseData)) throw new KeyforgeException("signed_payload_mismatch", "The response data does not match its signed payload.", 502);
        if (body.TryGetValue("nonce", out var nonce) && nonce is string expectedNonce && data.GetProperty("nonce").GetString() != expectedNonce)
            throw new KeyforgeException("nonce_mismatch", "The server response did not match this request.", 502);
        return data.Clone();
    }

    public async Task<JsonElement> ActivateAsync(string licenseKey, CancellationToken cancellationToken = default)
    {
        var body = ActivationFields(Nonce());
        body["licenseKey"] = licenseKey;
        var data = await PostVerifiedAsync("/api/v1/client/activate", body, cancellationToken);
        _sessionToken = data.GetProperty("sessionToken").GetString();
        return data;
    }

    public async Task<JsonElement> RegisterAsync(string licenseKey, string username, string password, string? email = null, CancellationToken cancellationToken = default)
    {
        var body = ActivationFields(Nonce());
        body["licenseKey"] = licenseKey;
        body["username"] = username;
        body["password"] = password;
        body["email"] = email;
        var data = await PostVerifiedAsync("/api/v1/client/register", body, cancellationToken);
        _sessionToken = data.GetProperty("sessionToken").GetString();
        return data;
    }

    public async Task<JsonElement> LoginAsync(string username, string password, string? totp = null, CancellationToken cancellationToken = default)
    {
        var body = ActivationFields(Nonce());
        body["username"] = username;
        body["password"] = password;
        body["totp"] = totp;
        var data = await PostVerifiedAsync("/api/v1/client/login", body, cancellationToken);
        _sessionToken = data.GetProperty("sessionToken").GetString();
        return data;
    }

    public Task<JsonElement> ValidateAsync(CancellationToken cancellationToken = default) =>
        PostVerifiedAsync("/api/v1/client/validate", new() { ["sessionToken"] = RequireSession(), ["nonce"] = Nonce() }, cancellationToken);

    public Task<JsonElement> HeartbeatAsync(CancellationToken cancellationToken = default) =>
        PostVerifiedAsync("/api/v1/client/heartbeat", new() { ["sessionToken"] = RequireSession(), ["nonce"] = Nonce() }, cancellationToken);

    public Task<JsonElement> ConfigurationAsync(CancellationToken cancellationToken = default) =>
        PostVerifiedAsync("/api/v1/client/config", new() { ["sessionToken"] = RequireSession(), ["nonce"] = Nonce() }, cancellationToken);

    public async Task<JsonElement> CallFunctionAsync(string name, object? input = null, CancellationToken cancellationToken = default)
    {
        var data = await PostVerifiedAsync($"/api/v1/client/functions/{Uri.EscapeDataString(name)}", new() { ["sessionToken"] = RequireSession(), ["nonce"] = Nonce(), ["input"] = input }, cancellationToken);
        return data.GetProperty("response").Clone();
    }

    public async Task<JsonElement> FilesAsync(CancellationToken cancellationToken = default) =>
        (await PostVerifiedAsync("/api/v1/client/files", new() { ["sessionToken"] = RequireSession(), ["nonce"] = Nonce() }, cancellationToken)).GetProperty("files").Clone();

    public async Task<byte[]> DownloadFileAsync(JsonElement file, CancellationToken cancellationToken = default)
    {
        var path = file.GetProperty("downloadPath").GetString() ?? throw new KeyforgeException("invalid_file", "The managed-file response is invalid.", 500);
        using var response = await _http.PostAsJsonAsync($"{_options.BaseUrl}{path}", new { appId = _options.AppId, sessionToken = RequireSession(), nonce = Nonce() }, cancellationToken);
        if (!response.IsSuccessStatusCode) throw new KeyforgeException("download_failed", $"Protected file download returned HTTP {(int)response.StatusCode}.", (int)response.StatusCode);
        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        var actual = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        if (actual != file.GetProperty("sha256").GetString()?.ToLowerInvariant()) throw new KeyforgeException("file_hash_mismatch", "The downloaded file failed SHA-256 verification.", 502);
        return bytes;
    }

    public Task<JsonElement> GetUserVariableAsync(string key, CancellationToken cancellationToken = default) =>
        PostVerifiedAsync("/api/v1/client/user-variables", new() { ["sessionToken"] = RequireSession(), ["nonce"] = Nonce(), ["key"] = key }, cancellationToken);

    public Task<JsonElement> SetUserVariableAsync(string key, string value, CancellationToken cancellationToken = default) =>
        PostVerifiedAsync("/api/v1/client/user-variables", new() { ["sessionToken"] = RequireSession(), ["nonce"] = Nonce(), ["key"] = key, ["value"] = value }, cancellationToken);

    public Task<JsonElement> ChatAsync(string channel, string? message = null, string? after = null, CancellationToken cancellationToken = default) =>
        PostVerifiedAsync("/api/v1/client/chat", new() { ["sessionToken"] = RequireSession(), ["nonce"] = Nonce(), ["channel"] = channel, ["message"] = message, ["after"] = after }, cancellationToken);

    public Task<JsonElement> BeginTotpAsync(CancellationToken cancellationToken = default) =>
        PostVerifiedAsync("/api/v1/client/totp/begin", new() { ["sessionToken"] = RequireSession(), ["nonce"] = Nonce() }, cancellationToken);

    public async Task ConfirmTotpAsync(string token, CancellationToken cancellationToken = default) =>
        _ = await PostVerifiedAsync("/api/v1/client/totp/confirm", new() { ["sessionToken"] = RequireSession(), ["nonce"] = Nonce(), ["token"] = token }, cancellationToken);

    public async Task DeactivateAsync(CancellationToken cancellationToken = default)
    {
        if (_sessionToken is null) return;
        var token = _sessionToken;
        _sessionToken = null;
        using var response = await _http.PostAsJsonAsync($"{_options.BaseUrl}/api/v1/client/deactivate", new { appId = _options.AppId, sessionToken = token }, cancellationToken);
        response.EnsureSuccessStatusCode();
    }

    public void Dispose()
    {
        if (_ownsHttp) _http.Dispose();
    }
}
