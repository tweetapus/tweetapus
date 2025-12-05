CC = cc
CFLAGS = -Wall -Wextra -O2 -fPIC
SOURCES = algorithm.c
OBJECTS = $(SOURCES:.c=.o)
LIBS = -lm -lsqlite3

UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
    TARGET = algorithm.dylib
    LDFLAGS = -dynamiclib
else ifeq ($(UNAME_S),Linux)
    TARGET = algorithm.so
    LDFLAGS = -shared
else
    TARGET = algorithm.dll
    LDFLAGS = -shared
endif

all: $(TARGET)

$(TARGET): $(OBJECTS)
	$(CC) $(LDFLAGS) -o $(TARGET) $(OBJECTS) $(LIBS)

%.o: %.c algorithm.h
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f $(OBJECTS) *.so *.dylib *.dll

.PHONY: all clean
