CC = gcc
CFLAGS = -Wall -Wextra -O2 -fPIC
SOURCES = algorithm.c
OBJECTS = $(SOURCES:.c=.o)

# Detect OS and set appropriate flags and extension
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
    # macOS
    TARGET = algorithm.dylib
    LDFLAGS = -dynamiclib
else ifeq ($(UNAME_S),Linux)
    # Linux
    TARGET = algorithm.so
    LDFLAGS = -shared
else
    # Windows or other
    TARGET = algorithm.dll
    LDFLAGS = -shared
endif

all: $(TARGET)

$(TARGET): $(OBJECTS)
	$(CC) $(LDFLAGS) -o $(TARGET) $(OBJECTS) -lm

%.o: %.c algorithm.h
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJECTS) *.so *.dylib *.dll

.PHONY: all clean
