#include "algorithm.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <time.h>
#include <math.h>

#define MAX_AGE_HOURS 48
#define FRESH_TWEET_HOURS 6
#define VIRAL_THRESHOLD 100
#define MIN_ENGAGEMENT_RATIO 0.01
#define SUPER_FRESH_HOURS 2

static inline double safe_log(double x) {
    return (x > 0.0) ? log(x + 1.0) : 0.0;
}

static inline int safe_max(int a, int b) {
    return (a > b) ? a : b;
}

static double calculate_time_decay(double age_hours) {
    if (age_hours < 0.0) age_hours = 0.0;
    
    if (age_hours < SUPER_FRESH_HOURS) {
        return 2.2 - age_hours * 0.15;
    } else if (age_hours < FRESH_TWEET_HOURS) {
        return 1.9 - (age_hours - SUPER_FRESH_HOURS) * 0.2;
    } else if (age_hours < 12.0) {
        return 1.1 * exp(-(age_hours - FRESH_TWEET_HOURS) * 0.08);
    } else if (age_hours < 24.0) {
        return 0.65 * exp(-(age_hours - 12.0) * 0.06);
    } else if (age_hours < MAX_AGE_HOURS) {
        return 0.35 * exp(-(age_hours - 24.0) * 0.08);
    } else {
        return 0.12 * exp(-(age_hours - MAX_AGE_HOURS) * 0.1);
    }
}

static double calculate_engagement_quality(
    int like_count,
    int retweet_count,
    int reply_count,
    int quote_count
) {
    int total_engagement = like_count + retweet_count * 2 + reply_count + quote_count;
    
    if (total_engagement == 0) return 0.05;
    
    double total_for_ratio = (double)(like_count + retweet_count + reply_count + quote_count);
    if (total_for_ratio < 1.0) total_for_ratio = 1.0;
    
    double retweet_ratio = (double)retweet_count / total_for_ratio;
    double reply_ratio = (double)reply_count / total_for_ratio;
    double quote_ratio = (double)quote_count / total_for_ratio;
    double like_ratio = (double)like_count / total_for_ratio;
    
    double quality_score = 1.0;
    
    if (retweet_ratio > 0.15) quality_score *= 1.5;
    if (reply_ratio > 0.12) quality_score *= 1.4;
    if (quote_ratio > 0.08) quality_score *= 1.35;
    
    if (like_ratio > 0.95 && total_engagement > 10) {
        quality_score *= 0.7;
    }
    
    int engagement_types = 0;
    if (like_count > 0) engagement_types++;
    if (retweet_count > 0) engagement_types++;
    if (reply_count > 0) engagement_types++;
    if (quote_count > 0) engagement_types++;
    
    quality_score *= (0.7 + engagement_types * 0.15);
    
    double reply_like_ratio = (double)reply_count / safe_max(like_count, 1);
    if (reply_like_ratio > 1.5 && like_count < 10) {
        quality_score *= 0.5;
    }
    
    return quality_score;
}

static double calculate_virality_boost(int like_count, int retweet_count, double age_hours) {
    int total_actions = like_count + retweet_count * 3 + (retweet_count > 0 ? retweet_count : 0);
    
    if (age_hours < 0.05) age_hours = 0.05;
    
    double velocity = (double)total_actions / age_hours;
    double momentum = (double)(retweet_count * 2 + like_count) / (age_hours + 1.0);
    
    double boost = 1.0;
    
    if (total_actions >= VIRAL_THRESHOLD) {
        boost = 2.0 + safe_log(total_actions / (double)VIRAL_THRESHOLD) * 0.5;
    } else if (total_actions >= 50) {
        boost = 1.4 + (double)(total_actions - 50) / 50.0 * 0.6;
    } else if (total_actions >= 20) {
        boost = 1.0 + (double)(total_actions - 20) / 30.0 * 0.4;
    }
    
    if (velocity > 20.0) {
        boost *= 1.5 + safe_log(velocity / 20.0) * 0.3;
    } else if (velocity > 10.0) {
        boost *= 1.2 + safe_log(velocity / 10.0) * 0.25;
    }
    
    if (momentum > 15.0 && age_hours < 3.0) {
        boost *= 1.4;
    }
    
    if (age_hours < 1.0 && velocity > 5.0) {
        boost *= 1.3;
    }
    
    return boost;
}

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
    int has_community_note
) {
    if (created_at < 0) created_at = 0;
    if (like_count < 0) like_count = 0;
    if (retweet_count < 0) retweet_count = 0;
    if (reply_count < 0) reply_count = 0;
    if (quote_count < 0) quote_count = 0;
    if (has_media < 0) has_media = 0;
    if (!isfinite(hours_since_seen)) hours_since_seen = -1.0;
    if (hours_since_seen < -1.0) hours_since_seen = -1.0;
    if (author_repeats < 0) author_repeats = 0;
    if (content_repeats < 0) content_repeats = 0;
    if (!isfinite(novelty_factor) || novelty_factor <= 0.0) novelty_factor = 1.0;
    if (!isfinite(random_factor) || random_factor < 0.0) random_factor = 0.0;
    if (random_factor > 1.0) random_factor = 1.0;
    if (all_seen_flag != 0) all_seen_flag = 1;
    if (position_in_feed < 0) position_in_feed = 0;
    if (user_verified < 0) user_verified = 0;
    if (user_gold < 0) user_gold = 0;
    if (follower_count < 0) follower_count = 0;
    if (has_community_note < 0) has_community_note = 0;
    
    time_t now = time(NULL);
    double age_hours = (double)(now - created_at) / 3600.0;
    
    int total_engagement = like_count + retweet_count + reply_count + quote_count;
    
    if (age_hours > MAX_AGE_HOURS && total_engagement < 10) {
        return 0.0;
    }
    
    if (has_community_note) {
        if (age_hours < 12.0) {
            return 0.001;
        }
        return 0.0;
    }
    
    double time_decay = calculate_time_decay(age_hours);
    
    double engagement_quality = calculate_engagement_quality(
        like_count, retweet_count, reply_count, quote_count
    );
    
    double virality_boost = calculate_virality_boost(like_count, retweet_count, age_hours);
    
    double base_score = safe_log(like_count + 1) * 2.5 +
                       safe_log(retweet_count + 1) * 2.0 +
                       safe_log(reply_count + 1) * 1.2 +
                       safe_log(quote_count + 1) * 1.5;
    
    double media_boost = 1.0;
    if (has_media > 0) {
        media_boost = 1.25;
        if (age_hours < FRESH_TWEET_HOURS) {
            media_boost *= 1.15;
        }
    }
    
    if (quote_count > 0 && has_media > 0) {
        media_boost *= 1.12;
    }

    double seen_penalty = 1.0;
    if (hours_since_seen >= 0.0) {
        if (hours_since_seen < 0.5) {
            seen_penalty = 0.02;
        } else if (hours_since_seen < 2.0) {
            seen_penalty = 0.05;
        } else if (hours_since_seen < 6.0) {
            seen_penalty = 0.10;
        } else if (hours_since_seen < 12.0) {
            seen_penalty = 0.18;
        } else if (hours_since_seen < 24.0) {
            seen_penalty = 0.32;
        } else if (hours_since_seen < 48.0) {
            seen_penalty = 0.50;
        } else if (hours_since_seen < 96.0) {
            seen_penalty = 0.68;
        } else if (hours_since_seen < 168.0) {
            seen_penalty = 0.82;
        } else {
            seen_penalty = 0.92;
        }
    }

    double author_penalty = 1.0 / (1.0 + (double)author_repeats * 0.85);
    if (author_penalty < 0.12) author_penalty = 0.12;

    double content_penalty = 1.0 / (1.0 + (double)content_repeats * 2.0);
    if (content_penalty < 0.05) content_penalty = 0.05;

    double position_penalty = 1.0;
    if (position_in_feed < 5) {
        double penalty_strength = (5.0 - (double)position_in_feed) / 5.0;
        if (author_repeats > 0) {
            position_penalty *= (1.0 - penalty_strength * 0.4);
        }
        if (content_repeats > 0) {
            position_penalty *= (1.0 - penalty_strength * 0.5);
        }
    }

    double recency_adjust = 1.0;
    if (age_hours < 0.25) {
        recency_adjust = 1.35;
    } else if (age_hours < 1.0) {
        recency_adjust = 1.25;
    } else if (age_hours < 3.0) {
        recency_adjust = 1.15;
    } else if (age_hours < 6.0) {
        recency_adjust = 1.05;
    } else if (age_hours > MAX_AGE_HOURS) {
        recency_adjust = 0.5;
    } else if (age_hours > 36.0) {
        recency_adjust = 0.65;
    } else if (age_hours > 24.0) {
        recency_adjust = 0.75;
    }

    double discussion_boost = 1.0;
    if (reply_count > 0 && like_count > 0) {
        double reply_ratio = (double)reply_count / (double)safe_max(like_count, 1);
        if (reply_ratio > 0.0) {
            if (reply_ratio > 0.5) reply_ratio = 0.5;
            discussion_boost += reply_ratio * 0.7;
        }
    }

    double novelty_boost = novelty_factor;
    if (hours_since_seen < 0.0) {
        novelty_boost += 0.12;
    }
    if (novelty_boost < 0.75) novelty_boost = 0.75;
    if (novelty_boost > 1.5) novelty_boost = 1.5;

    double diversity_penalty = 1.0;
    if (author_repeats > 2 || content_repeats > 1) {
        diversity_penalty = 0.6 + random_factor * 0.35;
    }

    double verified_boost = 1.0;
    if (user_gold) {
        double engagement_multiplier = safe_log(like_count + retweet_count + reply_count + quote_count + 1) * 0.05;
        double follower_multiplier = safe_log(follower_count + 1) * 0.02;
        verified_boost = 1.15 + engagement_multiplier + follower_multiplier;
        if (verified_boost > 1.35) verified_boost = 1.35;
        
        if (hours_since_seen >= 0.0) {
            if (hours_since_seen < 24.0) {
                verified_boost *= 0.4;
            } else if (hours_since_seen < 48.0) {
                verified_boost *= 0.7;
            } else {
                verified_boost *= 0.85;
            }
        }
    } else if (user_verified) {
        double engagement_multiplier = safe_log(like_count + retweet_count + reply_count + quote_count + 1) * 0.03;
        double follower_multiplier = safe_log(follower_count + 1) * 0.01;
        verified_boost = 1.08 + engagement_multiplier + follower_multiplier;
        if (verified_boost > 1.18) verified_boost = 1.18;
        
        if (hours_since_seen >= 0.0) {
            if (hours_since_seen < 24.0) {
                verified_boost *= 0.5;
            } else if (hours_since_seen < 48.0) {
                verified_boost *= 0.75;
            } else {
                verified_boost *= 0.9;
            }
        }
    }
    
    if ((user_verified || user_gold) && author_repeats > 0) {
        verified_boost *= (1.0 / (1.0 + (double)author_repeats * 1.2));
        if (verified_boost < 0.5) verified_boost = 0.5;
    }

    double random_span = all_seen_flag ? 1.8 : 0.04;
    double random_offset = all_seen_flag ? 0.5 : 0.02;
    double random_component = random_offset + random_factor * random_span;
    double random_multiplier = all_seen_flag ? (1.0 + random_component * 0.35) : (1.0 + random_component * 0.08);
    
    if (author_repeats > 3 || content_repeats > 2) {
        random_multiplier *= (1.0 + random_factor * 0.5);
    }
    
    double final_score = base_score * 
                        time_decay * 
                        engagement_quality * 
                        virality_boost * 
                        media_boost *
                        seen_penalty *
                        author_penalty *
                        content_penalty *
                        position_penalty *
                        recency_adjust *
                        discussion_boost *
                        novelty_boost *
                        diversity_penalty *
                        verified_boost *
                        random_multiplier;

    if (all_seen_flag) {
        final_score += random_component * 2.5;
    } else {
        final_score += random_component;
    }
    
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
    
    static int seeded = 0;
    if (!seeded) {
        srand((unsigned int)time(NULL));
        seeded = 1;
    }

    for (size_t i = 0; i < count; i++) {
        double base_score = calculate_score(
            tweets[i].created_at,
            tweets[i].like_count,
            tweets[i].retweet_count,
            tweets[i].reply_count,
            tweets[i].quote_count,
            tweets[i].has_media,
            tweets[i].hours_since_seen,
            tweets[i].author_repeats,
            tweets[i].content_repeats,
            tweets[i].novelty_factor,
            tweets[i].random_factor,
            tweets[i].all_seen_flag,
            0,
            tweets[i].user_verified,
            tweets[i].user_gold,
            tweets[i].follower_count,
            tweets[i].has_community_note
        );

        tweets[i].score = base_score;
    }
    
    qsort(tweets, count, sizeof(Tweet), compare_tweets);

    for (size_t i = 0; i < count && i < 10; i++) {
        double adjusted_score = calculate_score(
            tweets[i].created_at,
            tweets[i].like_count,
            tweets[i].retweet_count,
            tweets[i].reply_count,
            tweets[i].quote_count,
            tweets[i].has_media,
            tweets[i].hours_since_seen,
            tweets[i].author_repeats,
            tweets[i].content_repeats,
            tweets[i].novelty_factor,
            tweets[i].random_factor,
            tweets[i].all_seen_flag,
            (int)i,
            tweets[i].user_verified,
            tweets[i].user_gold,
            tweets[i].follower_count,
            tweets[i].has_community_note
        );

        tweets[i].score = adjusted_score;
    }

    qsort(tweets, count, sizeof(Tweet), compare_tweets);
}

char *process_timeline(const char *json_input) {
    (void)json_input;
    return strdup("{\"ranked_ids\":[]}");
}
