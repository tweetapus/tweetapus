#ifndef ALGORITHM_H
#define ALGORITHM_H

#include <stddef.h>

typedef struct {
    char *id;
    char *content;
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
    int has_community_note;
    double user_super_tweeter_boost;
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
    int follower_count,
    int has_community_note,
    double user_super_tweeter_boost
);

void rank_tweets(Tweet *tweets, size_t count);
char *process_timeline(const char *json_input);

void set_recent_top_ids(const char **ids, size_t count);
void clear_recent_top_ids(void);
void record_top_shown(const char *id);
void clear_top_seen_cache(void);

#endif
