#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

typedef struct evp_pkey_st EVP_PKEY;

namespace keyforge {

class error final : public std::runtime_error {
public:
    error(std::string code, std::string message, long status_code);
    [[nodiscard]] const std::string& code() const noexcept;
    [[nodiscard]] long status_code() const noexcept;

private:
    std::string code_;
    long status_code_;
};

struct options {
    std::string base_url;
    std::string app_id;
    std::string public_key_pem;
    std::string installation_id;
    std::optional<std::string> installation_label;
    std::optional<std::string> client_version;
    long timeout_seconds = 20;
};

class client final {
public:
    explicit client(options configuration);
    ~client();
    client(const client&) = delete;
    client& operator=(const client&) = delete;
    client(client&&) noexcept;
    client& operator=(client&&) noexcept;

    void restore_session(std::string session_token);
    nlohmann::json activate(const std::string& license_key);
    nlohmann::json register_user(const std::string& license_key, const std::string& username, const std::string& password, const std::optional<std::string>& email = std::nullopt);
    nlohmann::json login(const std::string& username, const std::string& password, const std::optional<std::string>& totp = std::nullopt);
    nlohmann::json validate();
    nlohmann::json heartbeat();
    nlohmann::json configuration();
    nlohmann::json call_function(const std::string& name, const nlohmann::json& input = nullptr);
    nlohmann::json files();
    std::vector<std::uint8_t> download_file(const nlohmann::json& file);
    nlohmann::json get_user_variable(const std::string& key);
    nlohmann::json set_user_variable(const std::string& key, const std::string& value);
    nlohmann::json chat(const std::string& channel, const std::optional<std::string>& message = std::nullopt, const std::optional<std::string>& after = std::nullopt);
    nlohmann::json begin_totp();
    void confirm_totp(const std::string& token);
    void deactivate();

private:
    struct pkey_deleter { void operator()(EVP_PKEY* key) const noexcept; };
    options options_;
    std::unique_ptr<EVP_PKEY, pkey_deleter> public_key_;
    std::optional<std::string> session_token_;

    [[nodiscard]] std::string require_session() const;
    [[nodiscard]] nlohmann::json activation_fields(const std::string& request_nonce) const;
    [[nodiscard]] nlohmann::json session_body() const;
    nlohmann::json post_verified(const std::string& path, nlohmann::json body) const;
};

}
