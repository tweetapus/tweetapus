#include "algorithm.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <time.h>
#include <math.h>
#include <stdint.h>

#define MAX_AGE_HOURS 168
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

static double calculate_age_diversity_boost(int like_count, int retweet_count, int reply_count, int quote_count, double age_hours) {
    int total_engagement = like_count + retweet_count + reply_count + quote_count;
    double engagement_density = (double)total_engagement / (age_hours + 1.0);

    /* soften extremely new tweets so the feed does not over-index on the absolute latest */
    if (age_hours < 0.25) {
        double early_penalty = 0.92 + age_hours * 0.32;
        if (early_penalty < 0.9) early_penalty = 0.9;
        if (early_penalty > 1.0) early_penalty = 1.0;
        return early_penalty;
    }

    if (age_hours <= FRESH_TWEET_HOURS) {
        return 1.0;
    }

    if (age_hours > MAX_AGE_HOURS) {
        return 0.9;
    }

    double boost = 1.0;

    if (age_hours >= 6.0 && age_hours <= 18.0) {
        boost += 0.05 + fmin(0.12, engagement_density * 0.05);
    } else if (age_hours > 18.0 && age_hours <= 30.0) {
        boost += fmin(0.1, engagement_density * 0.04);
    }

    if (engagement_density > 0.6) {
        boost += fmin(0.2, (engagement_density - 0.6) * 0.08);
    }

    if (boost > 1.35) boost = 1.35;
    if (boost < 0.85) boost = 0.85;
    return boost;
}

static inline double content_repeat_penalty(int content_repeats) {
    if (content_repeats <= 0) return 1.0;
    double penalty = pow(0.55, (double)content_repeats);
    if (penalty < 0.01) penalty = 0.01;
    return penalty;
}

static inline double author_repeat_penalty(int author_repeats) {
    if (author_repeats <= 0) return 1.0;
    double penalty = pow(0.72, (double)author_repeats);
    if (penalty < 0.05) penalty = 0.05;
    return penalty;
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

    double author_penalty = author_repeat_penalty(author_repeats);

    double content_penalty = content_repeat_penalty(content_repeats);

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
    double random_multiplier = all_seen_flag ? (1.0 + random_component * 0.25) : (1.0 + random_component * 0.05);
    
    if (author_repeats > 1 || content_repeats > 0) {
        random_multiplier *= 0.92;
    }
    
    /* content_repeat_penalty already applied; no further multiplicative adjustments */

    /* Age diversity: favor slightly older content that still attracts engagement */
    double age_diversity = calculate_age_diversity_boost(like_count, retweet_count, reply_count, quote_count, age_hours);

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
    
    /* apply age diversity multiplier after all other penalties */
    final_score *= age_diversity;

    if (final_score < 0.0) final_score = 0.0;
    
    return final_score;
}

static int compare_tweets(const void *a, const void *b) {
    if (a == NULL || b == NULL) return 0;

    const Tweet *tweet_a = (const Tweet *)a;
    const Tweet *tweet_b = (const Tweet *)b;

    if (tweet_a == NULL || tweet_b == NULL) return 0;

    if (tweet_b->score > tweet_a->score) return 1;
    if (tweet_b->score < tweet_a->score) return -1;

    /* tie break: prefer more recent tweets */
    if (tweet_b->created_at > tweet_a->created_at) return 1;
    if (tweet_b->created_at < tweet_a->created_at) return -1;

    /* final tie: compare ids if possible */
    if (tweet_a->id && tweet_b->id) {
        int c = strcmp(tweet_a->id, tweet_b->id);
        if (c < 0) return -1;
        if (c > 0) return 1;
    }

    return 0;
}

void rank_tweets(Tweet *tweets, size_t count) {
    if (tweets == NULL || count == 0) return;
    
    static int seeded = 0;
    if (!seeded) {
        srand((unsigned int)time(NULL));
        seeded = 1;
    }

    time_t now_ts = time(NULL);

    /* build duplicate counts by tweet id to detect same item repeated in input */
    unsigned int *dup_counts = (unsigned int *)calloc(count, sizeof(unsigned int));
    if (!dup_counts) {
        /* allocation failed; proceed without deduplication */
        dup_counts = NULL;
    } else {
        for (size_t i = 0; i < count; i++) {
            const char *ida = tweets[i].id;
            if (!ida) continue;
            for (size_t j = i + 1; j < count; j++) {
                if (tweets[j].id && strcmp(ida, tweets[j].id) == 0) {
                    dup_counts[i]++;
                    dup_counts[j]++;
                }
            }
        }
    }

    for (size_t i = 0; i < count; i++) {
        int effective_repeats = tweets[i].content_repeats;
        if (dup_counts) {
            effective_repeats += (int)dup_counts[i] * 2;
        }

        double base_score = calculate_score(
            tweets[i].created_at,
            tweets[i].like_count,
            tweets[i].retweet_count,
            tweets[i].reply_count,
            tweets[i].quote_count,
            tweets[i].has_media,
            tweets[i].hours_since_seen,
            tweets[i].author_repeats,
            effective_repeats,
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
        int effective_repeats = tweets[i].content_repeats;
        if (dup_counts) {
            effective_repeats += (int)dup_counts[i] * 2;
        }

        double adjusted_score = calculate_score(
            tweets[i].created_at,
            tweets[i].like_count,
            tweets[i].retweet_count,
            tweets[i].reply_count,
            tweets[i].quote_count,
            tweets[i].has_media,
            tweets[i].hours_since_seen,
            tweets[i].author_repeats,
            effective_repeats,
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

    /* reorder so unique tweet ids are prioritized at the top of the feed */
    if (count > 1) {
        Tweet *unique_buffer = (Tweet *)malloc(sizeof(Tweet) * count);
        Tweet *duplicate_buffer = (Tweet *)malloc(sizeof(Tweet) * count);
        if (unique_buffer && duplicate_buffer) {
            size_t unique_count = 0;
            size_t duplicate_count = 0;
            for (size_t i = 0; i < count; i++) {
                int is_duplicate = 0;
                if (tweets[i].id) {
                    for (size_t u = 0; u < unique_count; u++) {
                        if (unique_buffer[u].id && strcmp(unique_buffer[u].id, tweets[i].id) == 0) {
                            is_duplicate = 1;
                            break;
                        }
                    }
                }
                if (!is_duplicate) {
                    unique_buffer[unique_count++] = tweets[i];
                } else {
                    duplicate_buffer[duplicate_count++] = tweets[i];
                }
            }

            size_t write_idx = 0;
            for (size_t i = 0; i < unique_count; i++) {
                tweets[write_idx++] = unique_buffer[i];
            }
            for (size_t i = 0; i < duplicate_count; i++) {
                tweets[write_idx++] = duplicate_buffer[i];
            }
        }
        if (unique_buffer) free(unique_buffer);
        if (duplicate_buffer) free(duplicate_buffer);
    }

    /* ensure the top portion of the feed contains some older tweets when available */
    if (count > 1) {
        size_t top_limit = (count < 10) ? count : 10;
        size_t desired_older = (top_limit >= 6) ? 2 : 1;
        size_t older_present = 0;
        for (size_t i = 0; i < top_limit; i++) {
            double age_hours = (double)(now_ts - (time_t)tweets[i].created_at) / 3600.0;
            if (age_hours < 0.0) age_hours = 0.0;
            if (age_hours >= 6.0) {
                older_present++;
            }
        }

        if (older_present < desired_older) {
            for (size_t k = top_limit; k < count && older_present < desired_older; k++) {
                double candidate_age = (double)(now_ts - (time_t)tweets[k].created_at) / 3600.0;
                if (candidate_age < 0.0) candidate_age = 0.0;
                if (candidate_age < 6.0) continue;

                int duplicate_id = 0;
                if (tweets[k].id) {
                    for (size_t i = 0; i < top_limit; i++) {
                        if (tweets[i].id && strcmp(tweets[i].id, tweets[k].id) == 0) {
                            duplicate_id = 1;
                            break;
                        }
                    }
                }
                if (duplicate_id) continue;

                size_t swap_idx = SIZE_MAX;
                double youngest_age = 1e9;
                for (size_t i = 0; i < top_limit; i++) {
                    double age_hours = (double)(now_ts - (time_t)tweets[i].created_at) / 3600.0;
                    if (age_hours < 0.0) age_hours = 0.0;
                    if (age_hours < 6.0 && age_hours < youngest_age) {
                        youngest_age = age_hours;
                        swap_idx = i;
                    }
                }

                if (swap_idx != SIZE_MAX) {
                    Tweet tmp = tweets[swap_idx];
                    tweets[swap_idx] = tweets[k];
                    tweets[k] = tmp;
                    older_present++;
                }
            }
        }
    }

    if (dup_counts) free(dup_counts);

    /* Build age buckets from 0=>fresh to 4=>older for mixing diversity */
    size_t *buckets[5];
    size_t bucket_counts[5];
    size_t bucket_pos[5];
    for (int i = 0; i < 5; i++) {
        buckets[i] = (size_t *)calloc(count, sizeof(size_t));
        bucket_counts[i] = 0;
        bucket_pos[i] = 0;
    }

    for (size_t i = 0; i < count; i++) {
        double age_hours = (double)(now_ts - (time_t)tweets[i].created_at) / 3600.0;
        if (age_hours < 0.0) age_hours = 0.0;
        int bucket = 0;
        if (age_hours < 6.0) bucket = 0; /* fresh */
        else if (age_hours < 24.0) bucket = 1; /* recent */
        else if (age_hours < 48.0) bucket = 2; /* 1 day */
        else if (age_hours < 96.0) bucket = 3; /* 2-4 days */
        else bucket = 4; /* 4+ days */

        buckets[bucket][bucket_counts[bucket]++] = i;
    }

    /* Prepare selection: ensure the top window has at least a couple older tweets */
    size_t top_limit = (count < 10) ? count : 10;
    size_t forced_old_needed = 0;
    size_t fresh_count_in_top = 0;
    for (size_t i = 0; i < top_limit; i++) {
        double age_hours = (double)(now_ts - (time_t)tweets[i].created_at) / 3600.0;
        if (age_hours < 6.0) fresh_count_in_top++;
    }
    if (fresh_count_in_top > (top_limit * 60 / 100)) {
        forced_old_needed = 2; /* require 2 older tweets if too many fresh */
    } else if (fresh_count_in_top > (top_limit * 40 / 100)) {
        forced_old_needed = 1;
    }

    size_t *final_idx = (size_t *)malloc(sizeof(size_t) * count);
    if (!final_idx) {
        for (int i = 0; i < 5; i++) { if (buckets[i]) free(buckets[i]); }
        return;
    }
    size_t selected = 0;

    /* selection flags to mark chosen indices */
    int *selected_flags = (int *)calloc(count, sizeof(int));
    if (!selected_flags) { free(final_idx); for (int i = 0; i < 5; i++) { if (buckets[i]) free(buckets[i]); } return; }

    /* author repetition heuristic: limit number of posts with repeated authors in top windows */
    size_t selected_author_repeat_count = 0;
    size_t max_author_repeat_slots = top_limit < 4 ? top_limit : 4;
    size_t forced_old_selected = 0;

    /* pick function: attempt to pick one tweet from bucket b without violating constraints */
    for (size_t round = 0; round < (size_t)count && selected < count; round++) {
        int tried_any = 0;
        /* rotate preference: start with bucket 0 then 2 then 1 then 3 then 4 - to encourage mixing older content*/
        int order[5] = {0, 2, 1, 3, 4};
        for (int oi = 0; oi < 5 && selected < count; oi++) {
            int b = order[(round + oi) % 5];
            size_t pos = bucket_pos[b];
            if (pos >= bucket_counts[b]) continue;
            size_t idx = buckets[b][pos];
            if (selected_flags[idx]) { bucket_pos[b]++; continue; }
            tried_any = 1;
            /* check duplicate id already selected */
            if (tweets[idx].id) {
                int dup = 0;
                for (size_t s = 0; s < selected; s++) {
                    if (tweets[final_idx[s]].id && strcmp(tweets[final_idx[s]].id, tweets[idx].id) == 0) { dup = 1; break; }
                }
                if (dup) { bucket_pos[b]++; continue; }
            }
            /* restrict selection of repeated authors based on author_repeats heuristic */
            if ((size_t)tweets[idx].author_repeats > 0 && selected_author_repeat_count >= max_author_repeat_slots) {
                bucket_pos[b]++;
                continue;
            }

            if (forced_old_needed > 0) {
                double age_hours = (double)(now_ts - (time_t)tweets[idx].created_at) / 3600.0;
                if (age_hours < 24.0) {
                    bucket_pos[b]++;
                    continue;
                }
            }

            /* commit selection */
            final_idx[selected] = idx;
            selected_flags[idx] = 1;
            if ((size_t)tweets[idx].author_repeats > 0) {
                selected_author_repeat_count++;
            }
            selected++;
            if (forced_old_needed > 0) {
                double age_hours = (double)(now_ts - (time_t)tweets[idx].created_at) / 3600.0;
                if (age_hours >= 24.0) {
                    forced_old_selected++;
                    if (forced_old_selected >= forced_old_needed) {
                        forced_old_needed = 0;
                    }
                }
            }
            bucket_pos[b]++;
        }
        if (!tried_any) break; /* nothing left to pick */
        if (forced_old_needed == 0) {
            forced_old_selected = 0;
        }
    }

    /* Fill remaining positions with any unselected tweets (including duplicates) */
    for (size_t i = 0; i < count && selected < count; i++) {
        if (!selected_flags[i]) {
            final_idx[selected++] = i;
            selected_flags[i] = 1;
        }
    }

    /* Reorder tweets as per final_idx */
    if (selected == count) {
        Tweet *copy = (Tweet *)malloc(sizeof(Tweet) * count);
        if (copy) {
            for (size_t i = 0; i < count; i++) copy[i] = tweets[final_idx[i]];
            for (size_t i = 0; i < count; i++) tweets[i] = copy[i];
            free(copy);
        }
    }

    /* enforce forced older count if needed: try swapping in older candidates */
    if (forced_old_needed > 0) {
        size_t current_older = 0;
        for (size_t i = 0; i < top_limit; i++) {
            double age_hours = (double)(now_ts - (time_t)tweets[i].created_at) / 3600.0;
            if (age_hours >= 24.0) current_older++;
        }
        if (current_older < forced_old_needed) {
            for (size_t k = top_limit; k < count && current_older < forced_old_needed; k++) {
                double candidate_age = (double)(now_ts - (time_t)tweets[k].created_at) / 3600.0;
                if (candidate_age < 24.0) continue; /* want day+ */
                /* ensure candidate doesn't duplicate any top ids */
                int conflict = 0;
                if (tweets[k].id) {
                    for (size_t t = 0; t < top_limit; t++) {
                        if (tweets[t].id && strcmp(tweets[t].id, tweets[k].id) == 0) { conflict = 1; break; }
                    }
                }
                if (conflict) continue;
                /* swap candidate in for a fresh top item */
                size_t youngest_idx = SIZE_MAX; double youngest_age = 1e9;
                for (size_t t = 0; t < top_limit; t++) {
                    double age_hours = (double)(now_ts - (time_t)tweets[t].created_at) / 3600.0;
                    if (age_hours < youngest_age) { youngest_age = age_hours; youngest_idx = t; }
                }
                if (youngest_idx != SIZE_MAX) {
                    Tweet tmp = tweets[youngest_idx];
                    tweets[youngest_idx] = tweets[k];
                    tweets[k] = tmp;
                    current_older++;
                }
            }
        }
    }

    free(final_idx);
    free(selected_flags);
    for (int i = 0; i < 5; i++) if (buckets[i]) free(buckets[i]);

    /* Reduce adjacency duplicates in the top portion - try to swap duplicates out */
    size_t top_limit_adj = (count < 10) ? count : 10;
    for (size_t i = 0; i + 1 < top_limit_adj; i++) {
        if (!tweets[i].id || !tweets[i+1].id) continue;
        if (strcmp(tweets[i].id, tweets[i+1].id) == 0) {
            /* find a later non-duplicate to swap with i+1 */
            size_t swap_idx = SIZE_MAX;
            for (size_t j = top_limit_adj; j < count; j++) {
                if (!tweets[j].id) continue;
                if (strcmp(tweets[j].id, tweets[i].id) != 0) { swap_idx = j; break; }
            }
            if (swap_idx != SIZE_MAX) {
                Tweet tmp = tweets[i+1];
                tweets[i+1] = tweets[swap_idx];
                tweets[swap_idx] = tmp;
            }
        }
    }
}

char *process_timeline(const char *json_input) {
    (void)json_input;
    return strdup("{\"ranked_ids\":[]}");
}
