cmake_minimum_required(VERSION 3.14)
project(disaster_optimizer CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Release build for performance
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

set(CMAKE_CXX_FLAGS_RELEASE "-O2 -DNDEBUG")

add_executable(optimizer optimizer.cpp)

# Install to parent directory so Python can find it easily
install(TARGETS optimizer DESTINATION ${CMAKE_SOURCE_DIR}/../bin)
