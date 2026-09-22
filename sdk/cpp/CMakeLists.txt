cmake_minimum_required(VERSION 3.20)
project(keyforge_client VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(CURL REQUIRED)
find_package(OpenSSL 3.0 REQUIRED COMPONENTS Crypto)
find_package(nlohmann_json 3.11 REQUIRED)

add_library(keyforge_client src/keyforge.cpp)
target_include_directories(keyforge_client PUBLIC include)
target_link_libraries(keyforge_client PUBLIC CURL::libcurl OpenSSL::Crypto nlohmann_json::nlohmann_json)

install(TARGETS keyforge_client)
install(FILES include/keyforge/keyforge.hpp DESTINATION include/keyforge)
