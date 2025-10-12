#include "algorithm.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <time.h>
#include <math.h>

#define MAX_AGE_HOURS 72
#define FRESH_TWEET_HOURS 6
#define VIRAL_THRESHOLD 100
#define MIN_ENGAGEMENT_RATIO 0.01

static inline double safe_log(double x) {
    return (x > 0.0) ? log(x + 1.0) : 0.0;
}

static inline int safe_max(int a, int b) {
    return (a > b) ? a : b;
}

static double calculate_time_decay(double age_hours) {
    if (age_hours < 0.0) age_hours = 0.0;
    
    if (age_hours < FRESH_TWEET_HOURS) {
        return 1.0 + (FRESH_TWEET_HOURS - age_hours) / FRESH_TWEET_HOURS * 0.8;
    } else if (age_hours < 24.0) {
        return 1.0 - (age_hours - FRESH_TWEET_HOURS) / (24.0 - FRESH_TWEET_HOURS) * 0.3;
    } else if (age_hours < MAX_AGE_HOURS) {
        return 0.7 - (age_hours - 24.0) / (MAX_AGE_HOURS - 24.0) * 0.5;
    } else {
        return 0.2 * exp(-(age_hours - MAX_AGE_HOURS) / 24.0);
    }
}

static double calculate_engagement_quality(
    int like_count,
    int retweet_count,
    int reply_count,
    int quote_count
) {
    int total_engagement = like_count + retweet_count * 2 + reply_count + quote_count;
    
    if (total_engagement == 0) return 0.1;
    
    double retweet_ratio = (double)retweet_count / safe_max(like_count, 1);
    double reply_ratio = (double)reply_count / safe_max(like_count, 1);
    double quote_ratio = (double)quote_count / safe_max(like_count, 1);
    
    double quality_score = 1.0;
    
    if (retweet_ratio > 0.3) quality_score *= 1.4;
    if (reply_ratio > 0.2) quality_score *= 1.3;
    if (quote_ratio > 0.1) quality_score *= 1.2;
    
    return quality_score;
}

static double calculate_virality_boost(int like_count, int retweet_count, double age_hours) {
    int total_actions = like_count + retweet_count * 2;
    
    if (age_hours < 0.1) age_hours = 0.1;
    
    double velocity = (double)total_actions / age_hours;
    
    double boost = 1.0;
    
    if (total_actions >= VIRAL_THRESHOLD) {
        boost = 1.5 + safe_log(total_actions / (double)VIRAL_THRESHOLD) * 0.3;
    } else if (total_actions >= 50) {
        boost = 1.0 + (double)(total_actions - 50) / 50.0 * 0.5;
    } else if (total_actions >= 20) {
        boost = 1.0 + (double)(total_actions - 20) / 30.0 * 0.3;
    }
    
    if (velocity > 10.0) {
        boost *= 1.0 + safe_log(velocity / 10.0) * 0.2;
    }
    
    return boost;
}

double calculate_score(
    long long created_at,
    int like_count,
    int retweet_count,
    int reply_count,
    int quote_count
) {
    if (created_at < 0) created_at = 0;
    if (like_count < 0) like_count = 0;
    if (retweet_count < 0) retweet_count = 0;
    if (reply_count < 0) reply_count = 0;
    if (quote_count < 0) quote_count = 0;
    
    time_t now = time(NULL);
    double age_hours = (double)(now - created_at) / 3600.0;
    
    int total_engagement = like_count + retweet_count + reply_count + quote_count;
    
    if (age_hours > MAX_AGE_HOURS && total_engagement < 5) {
        return 0.0;
    }
    
    double time_decay = calculate_time_decay(age_hours);
    
    double engagement_quality = calculate_engagement_quality(
        like_count, retweet_count, reply_count, quote_count
    );
    
    double virality_boost = calculate_virality_boost(like_count, retweet_count, age_hours);
    
    double base_score = safe_log(like_count + 1) * 2.0 +
                       safe_log(retweet_count + 1) * 3.0 +
                       safe_log(reply_count + 1) * 1.5 +
                       safe_log(quote_count + 1) * 2.5;
    
    double diversity_bonus = 1.0;
    int engagement_types = 0;
    if (like_count > 0) engagement_types++;
    if (retweet_count > 0) engagement_types++;
    if (reply_count > 0) engagement_types++;
    if (quote_count > 0) engagement_types++;
    diversity_bonus = 1.0 + (engagement_types - 1) * 0.15;
    
    double final_score = base_score * 
                        time_decay * 
                        engagement_quality * 
                        virality_boost * 
                        diversity_bonus;
    
    if (final_score < 0.0) final_score = 0.0;
    
    return final_score;
}

static int compare_tweets(const void *a, const void *b) {
    if (a == NULL || b == NULL) return 0;
    
    const Tweet *tweet_a = (const Tweet *)a;
    const Tweet *tweet_b = (const Tweet *)b;
    
    if (tweet_b->score > tweet_a->score) return 1;
    if (tweet_b->score < tweet_a->score) return -1;
    return 0;
}

void rank_tweets(Tweet *tweets, size_t count) {
    if (tweets == NULL || count == 0) return;
    
    for (size_t i = 0; i < count; i++) {
        tweets[i].score = calculate_score(
            tweets[i].created_at,
            tweets[i].like_count,
            tweets[i].retweet_count,
            tweets[i].reply_count,
            tweets[i].quote_count
        );
    }
    
    qsort(tweets, count, sizeof(Tweet), compare_tweets);
}

char *process_timeline(const char *json_input) {
    return strdup("{\"ranked_ids\":[]}");
}
