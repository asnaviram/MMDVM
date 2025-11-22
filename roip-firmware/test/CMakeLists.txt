cmake_minimum_required(VERSION 3.10)
project(RTP_RTCP_Tests)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Add the main source directory
include_directories(${CMAKE_SOURCE_DIR}/../src)
include_directories(${CMAKE_SOURCE_DIR}/../include)

# Add Unity framework include directory
include_directories(${CMAKE_SOURCE_DIR}/../.pio/libdeps/esp32s3-roip-test/Unity/src)

# Add RTP handler test executable
add_executable(test_rtp_handler
    test_rtp_handler.cpp
    ../src/rtp_handler.cpp
)

# Add DSP processor test executable
add_executable(test_dsp_processor
    test_dsp_processor.cpp
    ../src/dsp_processor.cpp
    ${CMAKE_SOURCE_DIR}/../.pio/libdeps/esp32s3-roip-test/Unity/src/unity.c
)

# Add Audio Pipeline test executable
add_executable(test_audio_pipeline
    test_audio_pipeline.cpp
    ../src/audio_pipeline.cpp
    ${CMAKE_SOURCE_DIR}/../.pio/libdeps/esp32s3-roip-test/Unity/src/unity.c
)

# Enable coverage reporting
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(test_rtp_handler PRIVATE --coverage -fprofile-arcs -ftest-coverage -O0)
    target_link_options(test_rtp_handler PRIVATE --coverage)

    target_compile_options(test_dsp_processor PRIVATE --coverage -fprofile-arcs -ftest-coverage -O0)
    target_link_options(test_dsp_processor PRIVATE --coverage -lm)

    target_compile_options(test_audio_pipeline PRIVATE --coverage -fprofile-arcs -ftest-coverage -O0)
    target_link_options(test_audio_pipeline PRIVATE --coverage -lm)
endif()

# Link math library for DSP processor and audio pipeline
target_link_libraries(test_dsp_processor PRIVATE m)
target_link_libraries(test_audio_pipeline PRIVATE m)

# Add test target
enable_testing()
add_test(NAME RTPRTCPTests COMMAND test_rtp_handler)
add_test(NAME DSPProcessorTests COMMAND test_dsp_processor)
add_test(NAME AudioPipelineTests COMMAND test_audio_pipeline)
