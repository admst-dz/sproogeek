cmake_minimum_required(VERSION 3.16)

project(glb_unwrapper LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(glb_unwrapper src/main.cpp)

target_compile_options(glb_unwrapper PRIVATE
    $<$<CXX_COMPILER_ID:GNU,Clang,AppleClang>:-Wall -Wextra -Wpedantic>
)

install(TARGETS glb_unwrapper RUNTIME DESTINATION bin)
