#ifndef ALGORITHM_H
#define ALGORITHM_H

#include <stddef.h>

typedef struct {
    char *id;
    long long created_at;
    int like_count;
    int retweet_count;
    int reply_count;
    int quote_count;
    double score;
} Tweet;

typedef struct {
    Tweet *tweets;
    size_t count;
} TweetList;

double calculate_score(
    long long created_at, 
    int like_count, 
    int retweet_count,
    int reply_count,
    int quote_count
);

void rank_tweets(Tweet *tweets, size_t count);
char *process_timeline(const char *json_input);

#endif
