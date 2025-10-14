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
    int has_media;
    int seen_count;
    double hours_since_seen;
    int author_repeats;
    int content_repeats;
    double novelty_factor;
    double random_factor;
    int all_seen_flag;
    int user_verified;
    int user_gold;
    int follower_count;
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
    int quote_count,
    int has_media,
    double hours_since_seen,
    int author_repeats,
    int content_repeats,
    double novelty_factor,
    double random_factor,
    int all_seen_flag,
    int position_in_feed,
    int user_verified,
    int user_gold,
    int follower_count
);

void rank_tweets(Tweet *tweets, size_t count);
char *process_timeline(const char *json_input);

#endif
