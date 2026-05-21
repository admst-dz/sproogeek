cmake_minimum_required(VERSION 3.16)

project(glb_unwrapper LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(glb_unwrapper
    src/accessor_reader.cpp
    src/cli.cpp
    src/format.cpp
    src/glb_reader.cpp
    src/json.cpp
    src/main.cpp
    src/print_kit.cpp
    src/uv_exporter.cpp
)

target_compile_options(glb_unwrapper PRIVATE
    $<$<CXX_COMPILER_ID:GNU,Clang,AppleClang>:-Wall -Wextra -Wpedantic>
)

install(TARGETS glb_unwrapper RUNTIME DESTINATION bin)
