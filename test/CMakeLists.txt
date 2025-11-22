cmake_minimum_required(VERSION 3.10)
project(opus_codec_tests CXX)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Include directories for mocks - MUST be first!
set(MOCK_INCLUDE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/cmake)

# Add mock includes to CMAKE_CXX_FLAGS so they take priority
add_compile_options(-I${MOCK_INCLUDE_DIR})

# Find libopus
find_package(PkgConfig REQUIRED)
pkg_check_modules(LIBOPUS libopus)

if(NOT LIBOPUS_FOUND)
    message(STATUS "libopus not found with pkg-config, trying system libraries...")
    find_library(OPUS_LIB opus)
    if(NOT OPUS_LIB)
        message(FATAL_ERROR "libopus not found. Install with: apt-get install libopus-dev")
    endif()
    set(LIBOPUS_LIBRARIES ${OPUS_LIB})
    set(LIBOPUS_INCLUDE_DIRS "/usr/include")
endif()

message(STATUS "Found libopus: ${LIBOPUS_LIBRARIES}")
message(STATUS "Opus include dirs: ${LIBOPUS_INCLUDE_DIRS}")

# Create test executable
add_executable(test_codec_opus
    test_codec_opus.cpp
    ../roip-firmware/src/codec_opus.cpp
)

# Include directories - Order matters! Mocks must come first
target_include_directories(test_codec_opus BEFORE PRIVATE
    ${MOCK_INCLUDE_DIR}
)

target_include_directories(test_codec_opus PRIVATE
    ${LIBOPUS_INCLUDE_DIRS}
    /usr/include/opus
    ${CMAKE_CURRENT_SOURCE_DIR}/../roip-firmware/include
    ${CMAKE_CURRENT_SOURCE_DIR}
)

# Link libraries
target_link_libraries(test_codec_opus PRIVATE
    ${LIBOPUS_LIBRARIES}
    m  # Math library
    pthread
)

# Compiler flags
target_compile_options(test_codec_opus PRIVATE
    -Wall
    -Wextra
    -O2
    -std=c++17
    -fpermissive  # Allow implicit conversions from opus defines to OpusError enum
)

# Define test mode
target_compile_definitions(test_codec_opus PRIVATE
    UNITY_TEST=1
    MOCK_FREERTOS=1
    MOCK_ARDUINO=1
)

# Add custom command to run tests
add_custom_target(run_opus_tests
    COMMAND ${CMAKE_CURRENT_BINARY_DIR}/test_codec_opus
    DEPENDS test_codec_opus
    COMMENT "Running Opus codec tests..."
)

# Enable testing
enable_testing()
add_test(
    NAME opus_codec_tests
    COMMAND test_codec_opus
)
