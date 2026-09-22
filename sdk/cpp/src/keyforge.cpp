#include "keyforge/keyforge.hpp"

#include <algorithm>
#include <array>
#include <iomanip>
#include <regex>
#include <sstream>
#include <utility>

#include <curl/curl.h>
#include <openssl/bio.h>
#include <openssl/evp.h>
#include <openssl/pem.h>
#include <openssl/rand.h>
#include <openssl/sha.h>

namespace keyforge {
namespace {

std::string base64url(const unsigned char* bytes, std::size_t length) {
    std::string encoded(4 * ((length + 2) / 3), '\0');
    const auto size = EVP_EncodeBlock(reinterpret_cast<unsigned char*>(encoded.data()), bytes, static_cast<int>(length));
    encoded.resize(static_cast<std::size_t>(size));
    std::replace(encoded.begin(), encoded.end(), '+', '-');
    std::replace(encoded.begin(), encoded.end(), '/', '_');
    while (!encoded.empty() && encoded.back() == '=') encoded.pop_back();
    return encoded;
}

std::vector<unsigned char> decode_base64url(std::string encoded) {
    std::replace(encoded.begin(), encoded.end(), '-', '+');
    std::replace(encoded.begin(), encoded.end(), '_', '/');
    while (encoded.size() % 4 != 0) encoded.push_back('=');
    std::vector<unsigned char> result(encoded.size());
    const auto size = EVP_DecodeBlock(result.data(), reinterpret_cast<const unsigned char*>(encoded.data()), static_cast<int>(encoded.size()));
    if (size < 0) throw error("invalid_signature", "The response signature encoding is invalid.", 502);
    std::size_t padding = 0;
    if (!encoded.empty() && encoded.back() == '=') ++padding;
    if (encoded.size() > 1 && encoded[encoded.size() - 2] == '=') ++padding;
    result.resize(static_cast<std::size_t>(size) - padding);
    return result;
}

std::string nonce() {
    std::array<unsigned char, 24> bytes{};
    if (RAND_bytes(bytes.data(), static_cast<int>(bytes.size())) != 1) throw error("random_failed", "Secure random generation failed.", 500);
    return base64url(bytes.data(), bytes.size());
}

std::size_t write_string(char* data, std::size_t size, std::size_t count, void* destination) {
    auto* output = static_cast<std::string*>(destination);
    output->append(data, size * count);
    return size * count;
}

std::size_t write_bytes(char* data, std::size_t size, std::size_t count, void* destination) {
    auto* output = static_cast<std::vector<std::uint8_t>*>(destination);
    const auto length = size * count;
    output->insert(output->end(), reinterpret_cast<std::uint8_t*>(data), reinterpret_cast<std::uint8_t*>(data) + length);
    return length;
}

struct http_result { long status; std::string body; };

http_result post_json(const options& configuration, const std::string& path, const nlohmann::json& body) {
    CURL* handle = curl_easy_init();
    if (!handle) throw error("network_error", "libcurl could not initialize.", 0);
    std::string output;
    const std::string payload = body.dump();
    const std::string url = configuration.base_url + path;
    curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    headers = curl_slist_append(headers, "Accept: application/json");
    curl_easy_setopt(handle, CURLOPT_URL, url.c_str());
    curl_easy_setopt(handle, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(handle, CURLOPT_POSTFIELDS, payload.data());
    curl_easy_setopt(handle, CURLOPT_POSTFIELDSIZE, static_cast<long>(payload.size()));
    curl_easy_setopt(handle, CURLOPT_TIMEOUT, configuration.timeout_seconds);
    curl_easy_setopt(handle, CURLOPT_FOLLOWLOCATION, 0L);
    curl_easy_setopt(handle, CURLOPT_WRITEFUNCTION, write_string);
    curl_easy_setopt(handle, CURLOPT_WRITEDATA, &output);
    const CURLcode result = curl_easy_perform(handle);
    long status = 0;
    curl_easy_getinfo(handle, CURLINFO_RESPONSE_CODE, &status);
    curl_slist_free_all(headers);
    curl_easy_cleanup(handle);
    if (result != CURLE_OK) throw error("network_error", curl_easy_strerror(result), 0);
    return {status, std::move(output)};
}

std::pair<long, std::vector<std::uint8_t>> post_bytes(const options& configuration, const std::string& path, const nlohmann::json& body) {
    CURL* handle = curl_easy_init();
    if (!handle) throw error("network_error", "libcurl could not initialize.", 0);
    std::vector<std::uint8_t> output;
    const std::string payload = body.dump();
    const std::string url = configuration.base_url + path;
    curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    curl_easy_setopt(handle, CURLOPT_URL, url.c_str());
    curl_easy_setopt(handle, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(handle, CURLOPT_POSTFIELDS, payload.data());
    curl_easy_setopt(handle, CURLOPT_POSTFIELDSIZE, static_cast<long>(payload.size()));
    curl_easy_setopt(handle, CURLOPT_TIMEOUT, configuration.timeout_seconds);
    curl_easy_setopt(handle, CURLOPT_FOLLOWLOCATION, 0L);
    curl_easy_setopt(handle, CURLOPT_WRITEFUNCTION, write_bytes);
    curl_easy_setopt(handle, CURLOPT_WRITEDATA, &output);
    const CURLcode result = curl_easy_perform(handle);
    long status = 0;
    curl_easy_getinfo(handle, CURLINFO_RESPONSE_CODE, &status);
    curl_slist_free_all(headers);
    curl_easy_cleanup(handle);
    if (result != CURLE_OK) throw error("network_error", curl_easy_strerror(result), 0);
    return {status, std::move(output)};
}

std::string sha256_hex(const std::vector<std::uint8_t>& bytes) {
    std::array<unsigned char, SHA256_DIGEST_LENGTH> digest{};
    SHA256(bytes.data(), bytes.size(), digest.data());
    std::ostringstream output;
    output << std::hex << std::setfill('0');
    for (const auto value : digest) output << std::setw(2) << static_cast<int>(value);
    return output.str();
}

}

error::error(std::string code, std::string message, long status_code)
    : std::runtime_error(std::move(message)), code_(std::move(code)), status_code_(status_code) {}
const std::string& error::code() const noexcept { return code_; }
long error::status_code() const noexcept { return status_code_; }

void client::pkey_deleter::operator()(EVP_PKEY* key) const noexcept { EVP_PKEY_free(key); }

client::client(options configuration) : options_(std::move(configuration)) {
    while (!options_.base_url.empty() && options_.base_url.back() == '/') options_.base_url.pop_back();
    BIO* bio = BIO_new_mem_buf(options_.public_key_pem.data(), static_cast<int>(options_.public_key_pem.size()));
    if (!bio) throw std::invalid_argument("public_key_pem could not be read");
    public_key_.reset(PEM_read_bio_PUBKEY(bio, nullptr, nullptr, nullptr));
    BIO_free(bio);
    if (!public_key_ || EVP_PKEY_id(public_key_.get()) != EVP_PKEY_ED25519) throw std::invalid_argument("public_key_pem must contain an Ed25519 public key");
}

client::~client() = default;
client::client(client&&) noexcept = default;
client& client::operator=(client&&) noexcept = default;

void client::restore_session(std::string session_token) {
    if (session_token.size() < 30) throw error("invalid_session", "The session token is malformed.", 400);
    session_token_ = std::move(session_token);
}

std::string client::require_session() const {
    if (!session_token_) throw error("missing_session", "No client session is active.", 400);
    return *session_token_;
}

nlohmann::json client::activation_fields(const std::string& request_nonce) const {
    nlohmann::json body{{"installationId", options_.installation_id}, {"nonce", request_nonce}};
    if (options_.installation_label) body["installationLabel"] = *options_.installation_label;
    if (options_.client_version) body["clientVersion"] = *options_.client_version;
    return body;
}

nlohmann::json client::session_body() const { return {{"sessionToken", require_session()}, {"nonce", nonce()}}; }

nlohmann::json client::post_verified(const std::string& path, nlohmann::json body) const {
    body["appId"] = options_.app_id;
    const auto result = post_json(options_, path, body);
    nlohmann::json root;
    try { root = nlohmann::json::parse(result.body); }
    catch (const nlohmann::json::exception&) { throw error("invalid_response", "Keyforge returned invalid JSON.", result.status); }
    if (!root.value("success", false)) {
        const auto problem = root.value("error", nlohmann::json::object());
        throw error(problem.value("code", "request_failed"), problem.value("message", "The Keyforge request failed."), result.status);
    }
    if (root.value("algorithm", "") != "Ed25519") throw error("invalid_signature_algorithm", "The response algorithm is not supported.", 502);
    const auto data = root.at("data");
    const auto payload_bytes = decode_base64url(root.at("signedPayload").get<std::string>());
    const auto signature = decode_base64url(root.at("signature").get<std::string>());
    EVP_MD_CTX* context = EVP_MD_CTX_new();
    if (!context) throw error("verification_failed", "Signature verification could not initialize.", 502);
    const int initialized = EVP_DigestVerifyInit(context, nullptr, nullptr, nullptr, public_key_.get());
    const int verified = initialized == 1 ? EVP_DigestVerify(context, signature.data(), signature.size(), payload_bytes.data(), payload_bytes.size()) : 0;
    EVP_MD_CTX_free(context);
    if (verified != 1) throw error("invalid_signature", "The server response signature is invalid.", 502);
    try {
        if (nlohmann::json::parse(payload_bytes) != data) throw error("signed_payload_mismatch", "The response data does not match its signed payload.", 502);
    } catch (const nlohmann::json::exception&) {
        throw error("invalid_signed_payload", "The signed response payload is invalid.", 502);
    }
    if (body.contains("nonce") && data.value("nonce", "") != body.at("nonce").get<std::string>()) throw error("nonce_mismatch", "The server response did not match this request.", 502);
    return data;
}

nlohmann::json client::activate(const std::string& license_key) {
    auto body = activation_fields(nonce());
    body["licenseKey"] = license_key;
    auto data = post_verified("/api/v1/client/activate", body);
    session_token_ = data.at("sessionToken").get<std::string>();
    return data;
}

nlohmann::json client::register_user(const std::string& license_key, const std::string& username, const std::string& password, const std::optional<std::string>& email) {
    auto body = activation_fields(nonce());
    body["licenseKey"] = license_key;
    body["username"] = username;
    body["password"] = password;
    if (email) body["email"] = *email;
    auto data = post_verified("/api/v1/client/register", body);
    session_token_ = data.at("sessionToken").get<std::string>();
    return data;
}

nlohmann::json client::login(const std::string& username, const std::string& password, const std::optional<std::string>& totp) {
    auto body = activation_fields(nonce());
    body["username"] = username;
    body["password"] = password;
    if (totp) body["totp"] = *totp;
    auto data = post_verified("/api/v1/client/login", body);
    session_token_ = data.at("sessionToken").get<std::string>();
    return data;
}

nlohmann::json client::validate() { return post_verified("/api/v1/client/validate", session_body()); }
nlohmann::json client::heartbeat() { return post_verified("/api/v1/client/heartbeat", session_body()); }
nlohmann::json client::configuration() { return post_verified("/api/v1/client/config", session_body()); }

nlohmann::json client::call_function(const std::string& name, const nlohmann::json& input) {
    if (!std::regex_match(name, std::regex("^[A-Za-z0-9_.-]{1,80}$"))) throw error("invalid_function", "The remote function name is invalid.", 400);
    auto body = session_body();
    body["input"] = input;
    return post_verified("/api/v1/client/functions/" + name, body).at("response");
}

nlohmann::json client::files() { return post_verified("/api/v1/client/files", session_body()).at("files"); }

std::vector<std::uint8_t> client::download_file(const nlohmann::json& file) {
    auto body = session_body();
    body["appId"] = options_.app_id;
    auto [status, bytes] = post_bytes(options_, file.at("downloadPath").get<std::string>(), body);
    if (status < 200 || status >= 300) throw error("download_failed", "The protected file download failed.", status);
    if (sha256_hex(bytes) != file.at("sha256").get<std::string>()) throw error("file_hash_mismatch", "The downloaded file failed SHA-256 verification.", 502);
    return bytes;
}

nlohmann::json client::get_user_variable(const std::string& key) {
    auto body = session_body(); body["key"] = key;
    return post_verified("/api/v1/client/user-variables", body);
}

nlohmann::json client::set_user_variable(const std::string& key, const std::string& value) {
    auto body = session_body(); body["key"] = key; body["value"] = value;
    return post_verified("/api/v1/client/user-variables", body);
}

nlohmann::json client::chat(const std::string& channel, const std::optional<std::string>& message, const std::optional<std::string>& after) {
    auto body = session_body(); body["channel"] = channel;
    if (message) body["message"] = *message;
    if (after) body["after"] = *after;
    return post_verified("/api/v1/client/chat", body).at("messages");
}

nlohmann::json client::begin_totp() { return post_verified("/api/v1/client/totp/begin", session_body()); }
void client::confirm_totp(const std::string& token) { auto body = session_body(); body["token"] = token; post_verified("/api/v1/client/totp/confirm", body); }

void client::deactivate() {
    if (!session_token_) return;
    const auto token = *session_token_;
    session_token_.reset();
    const auto result = post_json(options_, "/api/v1/client/deactivate", {{"appId", options_.app_id}, {"sessionToken", token}});
    if (result.status < 200 || result.status >= 300) throw error("deactivate_failed", "Session deactivation failed.", result.status);
}

}
