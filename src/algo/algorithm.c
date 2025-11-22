#include "algorithm.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <time.h>
#include <math.h>
#include <stdint.h>
#include <ctype.h>

#define MAX_AGE_HOURS 168
#define MAX_TOKENS 12
#define MIN_TOKEN_LEN 3
#define URL_PREFIX_HTTP "http://"
#define URL_PREFIX_HTTPS "https://"
#define RECENT_TOP_LIMIT 64
#define TOP_SEEN_CACHE_LIMIT 256
#define FRESH_TWEET_HOURS 6
#define VIRAL_THRESHOLD 100
#define MIN_ENGAGEMENT_RATIO 0.01
#define SUPER_FRESH_HOURS 2
#define ENGAGEMENT_FLOOR_DENOM 25

static inline double safe_log(double x) {
    return (x > 0.0) ? log(x + 1.0) : 0.0;
}

static inline double safe_div(double num, double den, double fallback) {
    if (!isfinite(num) || !isfinite(den) || den == 0.0) return fallback;
    return num / den;
}

static inline int safe_max(int a, int b) {
    return (a > b) ? a : b;
}

// safe_min_int removed (unused) - prefer using explicit logic in-place

static inline double clampd(double v, double lo, double hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}

static inline double compute_age_hours(time_t now_ts, long long created_at) {
    double age = (double)(now_ts - (time_t)created_at) / 3600.0;
    if (age < 0.0) age = 0.0;
    if (age > MAX_AGE_HOURS * 2) age = MAX_AGE_HOURS * 2;
    return age;
}

static int compare_doubles(const void *a, const void *b) {
    double da = *(const double *)a;
    double db = *(const double *)b;
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
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

    double retweet_ratio = safe_div((double)retweet_count, total_for_ratio, 0.0);
    double reply_ratio = safe_div((double)reply_count, total_for_ratio, 0.0);
    double quote_ratio = safe_div((double)quote_count, total_for_ratio, 0.0);
    double like_ratio = safe_div((double)like_count, total_for_ratio, 0.0);
    
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
    
    double reply_like_ratio = safe_div((double)reply_count, (double)safe_max(like_count, 1), 0.0);
    if (reply_like_ratio > 1.5 && like_count < 10) {
        quality_score *= 0.5;
    }
    
    return quality_score;
}

static double calculate_age_diversity_boost(int like_count, int retweet_count, int reply_count, int quote_count, double age_hours) {
    int total_engagement = like_count + retweet_count + reply_count + quote_count;
    double engagement_density = (double)total_engagement / (age_hours + 1.0);

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

    if (total_engagement < 3 && age_hours > 72.0) {
        boost *= 0.92;
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

static double calculate_virality_boost(int like_count, int retweet_count, int reply_count, int quote_count, int follower_count, double age_hours) {
    int total_actions = like_count + retweet_count * 3 + reply_count * 2 + quote_count;
    
    if (age_hours < 0.05) age_hours = 0.05;
    
    double velocity = safe_div((double)total_actions, age_hours, 0.0);
    double momentum = safe_div((double)(retweet_count * 2 + like_count + reply_count), (age_hours + 1.0), 0.0);
    
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
    
    // small follower scaling for accounts with large audiences
    if (follower_count > 10000) {
        boost *= 1.0 + clampd(safe_log(follower_count) * 0.02, 0.0, 0.35);
    }

    return clampd(boost, 0.01, 20.0);
}

// djb2 hash for content fingerprinting
static unsigned long djb2_hash(const char *str) {
    unsigned long hash = 5381;
    int c;
    while ((c = (unsigned char)*str++)) hash = ((hash << 5) + hash) + c;
    return hash;
}

// Simple content normalization: lower-case, strip URLs and excessive whitespace
static inline int has_url_prefix(const char *src, size_t idx, size_t len) {
    size_t max_check = len - idx;
    if (max_check < 4) return 0;
    const char *segment = &src[idx];
    for (size_t i = 0; i < strlen(URL_PREFIX_HTTP) && i < max_check; i++) {
        char ch = (char)tolower((unsigned char)segment[i]);
        if (ch != URL_PREFIX_HTTP[i]) {
            goto https_check;
        }
    }
    return 1;
https_check:
    if (max_check < strlen(URL_PREFIX_HTTPS)) return 0;
    for (size_t i = 0; i < strlen(URL_PREFIX_HTTPS); i++) {
        char ch = (char)tolower((unsigned char)segment[i]);
        if (ch != URL_PREFIX_HTTPS[i]) return 0;
    }
    return 1;
}

static char *normalize_content_c(const char *src) {
    if (!src) return NULL;
    size_t len = strlen(src);
    char *out = (char *)calloc(len + 1, sizeof(char));
    if (!out) return NULL;
    size_t oi = 0;
    int in_url = 0;
    for (size_t i = 0; i < len; i++) {
        char ch = src[i];
        if (!in_url && i + 7 < len && has_url_prefix(src, i, len)) {
            in_url = 1;
        }
        if (in_url) {
            if (ch == ' ' || ch == '\n' || ch == '\r' || ch == '\t') in_url = 0;
            continue;
        }
        if (ch == '\n' || ch == '\r' || ch == '\t') ch = ' ';
        if (oi > 0 && out[oi - 1] == ' ' && ch == ' ') continue;
        out[oi++] = (char)tolower((unsigned char)ch);
    }
    while (oi > 0 && out[oi - 1] == ' ') oi--;
    out[oi] = '\0';
    return out;
}

// naive token extractor, returns a malloc'ed array of tokens (null terminated). caller must free.
static int is_stopword(const char *s) {
    if (!s) return 0;
    // a small list of common short stopwords
    if (strcmp(s, "the") == 0) return 1;
    if (strcmp(s, "and") == 0) return 1;
    if (strcmp(s, "for") == 0) return 1;
    if (strcmp(s, "with") == 0) return 1;
    if (strcmp(s, "from") == 0) return 1;
    if (strcmp(s, "that") == 0) return 1;
    return 0;
}

static char **extract_tokens(const char *normalized, size_t *out_count) {
    if (!normalized) { *out_count = 0; return NULL; }
    size_t cap = MAX_TOKENS; // limit tokens for speed
    char **tokens = (char **)calloc(cap, sizeof(char *));
    if (!tokens) { *out_count = 0; return NULL; }
    size_t tcount = 0;
    const char *p = normalized;
    while (*p && tcount < cap) {
        while (*p && isspace((unsigned char)*p)) p++;
        if (!*p) break;
        const char *start = p;
        while (*p && !isspace((unsigned char)*p)) p++;
        size_t toklen = (size_t)(p - start);
        if (toklen > 0) {
            char *tok = (char *)calloc(toklen + 1, 1);
            if (!tok) break;
            memcpy(tok, start, toklen);
            // strip punctuation start/end
            size_t s = 0; size_t e = toklen;
            while (s < e && ispunct((unsigned char)tok[s])) s++;
            while (e > s && ispunct((unsigned char)tok[e-1])) e--;
            size_t outlen = e - s;
            if (outlen >= MIN_TOKEN_LEN && !is_stopword(tok)) {
                if (s > 0) memmove(tok, tok + s, outlen);
                tok[outlen] = '\0';
                tokens[tcount++] = tok;
            } else {
                free(tok);
            }
        }
    }
    *out_count = tcount;
    return tokens;
}

// free token array
static void free_tokens(char **tokens, size_t count) {
    if (!tokens) return;
    for (size_t i = 0; i < count; i++) {
        if (tokens[i]) free(tokens[i]);
    }
    free(tokens);
}

// compute jaccard-like similarity between two token lists
static double token_similarity(char **a, size_t ac, char **b, size_t bc) {
    if (!a || !b || ac == 0 || bc == 0) return 0.0;
    size_t inter = 0;
    for (size_t i = 0; i < ac; i++) {
        for (size_t j = 0; j < bc; j++) {
            if (strcmp(a[i], b[j]) == 0) { inter++; break; }
        }
    }
    double uni = (double)(ac + bc - inter);
    if (uni <= 0.0) return 0.0;
    return (double)inter / uni;
}

// Weighted sample without replacement based on adjusted weights. Fills `out` with indices of selected items.
// portable random double with optional seed (rand_r)
static double rand_double(unsigned int *seedptr) {
#ifdef __GNUC__
    if (seedptr) return (double)rand_r(seedptr) / (double)RAND_MAX;
    return (double)rand() / (double)RAND_MAX;
#else
    if (seedptr) { unsigned int s = *seedptr; s = s * 1103515245 + 12345; *seedptr = s; return (double)(s & 0x7fffffff) / (double)0x7fffffff; }
    return (double)rand() / (double)RAND_MAX;
#endif
}

// weighted_sample_indices removed (unused), randomization now uses rand_double logic inline

static size_t compute_adaptive_window(size_t total) {
    if (total <= 10) return total;
    if (total >= 30) return 30;
    return total;
}

static size_t compute_display_window(size_t total) {
    return (total < 10) ? total : 10;
}

static void randomize_front_window(
    Tweet *tweets,
    size_t count,
    size_t window,
    time_t now_ts,
    const double *age_cache,
    const int *cluster_counts,
    const int *cluster_ids,
    const int *author_prevalence
) {
    if (!tweets || window == 0 || count <= window) return;

    double *weights = (double *)malloc(sizeof(double) * count);
    int *picked = (int *)calloc(count, sizeof(int));
    size_t *selected = (size_t *)malloc(sizeof(size_t) * window);
    if (!weights || !picked || !selected) {
        if (weights) free(weights);
        if (picked) free(picked);
        if (selected) free(selected);
        return;
    }

    for (size_t i = 0; i < count; i++) {
        double age_hours = age_cache ? age_cache[i] : compute_age_hours(now_ts, tweets[i].created_at);
        double freshness = 1.0 / (1.0 + age_hours * 0.35);
        double repeat_penalty = 1.0 / (1.0 + tweets[i].author_repeats * 0.8 + tweets[i].content_repeats * 1.2);
        double seen_penalty = (tweets[i].hours_since_seen >= 0.0)
            ? 1.0 / (1.0 + tweets[i].hours_since_seen * 0.15)
            : 1.15;
        double cluster_penalty = 1.0;
        if (cluster_counts && cluster_ids && cluster_ids[i] >= 0) {
            int cc = cluster_counts[cluster_ids[i]];
            if (cc > 1) cluster_penalty = 1.0 / (1.0 + (double)(cc - 1) * 0.25);
        }
        double author_penalty = 1.0;
        if (author_prevalence && author_prevalence[i] > 1) {
            author_penalty = 1.0 / (1.0 + (double)(author_prevalence[i] - 1) * 0.3);
        }
        double weight = tweets[i].score * freshness * repeat_penalty * seen_penalty * cluster_penalty * author_penalty;
        if (age_hours < 1.0) weight *= 1.08; // slight bias to ultra fresh
        if (age_hours > 24.0) weight *= 1.05; // ensure older content occasionally promoted
        if (weight < 0.0001) weight = 0.0001;
        weights[i] = weight;
    }

    size_t actual_window = (window < count) ? window : count;
    for (size_t picked_count = 0; picked_count < actual_window; picked_count++) {
        double total = 0.0;
        for (size_t i = 0; i < count; i++) {
            if (!picked[i]) total += weights[i];
        }
        if (total <= 0.0) {
            window = picked_count;
            break;
        }
        double target = rand_double(NULL) * total;
        double cumulative = 0.0;
        size_t choice = 0;
        for (size_t i = 0; i < count; i++) {
            if (picked[i]) continue;
            cumulative += weights[i];
            if (cumulative >= target) {
                choice = i;
                break;
            }
        }
        picked[choice] = 1;
        selected[picked_count] = choice;
    }

    for (size_t i = 0; i + 1 < actual_window; i++) {
        for (size_t j = i + 1; j < actual_window; j++) {
            if (tweets[selected[j]].score > tweets[selected[i]].score) {
                size_t tmp = selected[i];
                selected[i] = selected[j];
                selected[j] = tmp;
            }
        }
    }

    Tweet *buffer = (Tweet *)malloc(sizeof(Tweet) * count);
    if (!buffer) {
        free(weights);
        free(picked);
        free(selected);
        return;
    }

    size_t write_idx = 0;
    for (size_t i = 0; i < actual_window; i++) {
        buffer[write_idx++] = tweets[selected[i]];
    }
    for (size_t i = 0; i < count; i++) {
        if (picked[i]) continue;
        buffer[write_idx++] = tweets[i];
    }

    for (size_t i = 0; i < count; i++) {
        tweets[i] = buffer[i];
    }

    free(buffer);
    free(weights);
    free(picked);
    free(selected);
}

static char **recent_top_ids = NULL;
static size_t recent_top_count = 0;

void set_recent_top_ids(const char **ids, size_t count) {
    if (recent_top_ids) {
        for (size_t i = 0; i < recent_top_count; i++) {
            free(recent_top_ids[i]);
        }
        free(recent_top_ids);
        recent_top_ids = NULL;
        recent_top_count = 0;
    }
    if (!ids || count == 0) return;
    if (count > RECENT_TOP_LIMIT) count = RECENT_TOP_LIMIT;
    recent_top_ids = (char **)calloc(count, sizeof(char *));
    if (!recent_top_ids) { recent_top_count = 0; return; }
    for (size_t i = 0; i < count; i++) {
        if (ids[i]) recent_top_ids[i] = strdup(ids[i]); else recent_top_ids[i] = NULL;
    }
    recent_top_count = count;
}

void clear_recent_top_ids(void) {
    if (!recent_top_ids) return;
    for (size_t i = 0; i < recent_top_count; i++) {
        if (recent_top_ids[i]) free(recent_top_ids[i]);
    }
    free(recent_top_ids);
    recent_top_ids = NULL;
    recent_top_count = 0;
}

static int is_recent_top_id(const char *id) {
    if (!id || !recent_top_ids) return 0;
    for (size_t i = 0; i < recent_top_count; i++) {
        if (!recent_top_ids[i]) continue;
        if (strcmp(recent_top_ids[i], id) == 0) return 1;
    }
    return 0;
}

static char **top_seen_cache_ids = NULL;
static int *top_seen_cache_counts = NULL;
static size_t top_seen_cache_len = 0;
static size_t top_seen_cache_cap = 0;

static int top_seen_cache_find(const char *id) {
    if (!id || !top_seen_cache_ids) return -1;
    for (size_t i = 0; i < top_seen_cache_len; i++) {
        if (top_seen_cache_ids[i] && strcmp(top_seen_cache_ids[i], id) == 0) return (int)i;
    }
    return -1;
}

void record_top_shown(const char *id) {
    if (!id) return;
    int idx = top_seen_cache_find(id);
    if (idx >= 0) {
        top_seen_cache_counts[idx]++;
        return;
    }
    if (top_seen_cache_len >= TOP_SEEN_CACHE_LIMIT) {
        size_t drop = TOP_SEEN_CACHE_LIMIT / 4;
        if (drop == 0) drop = 1;
        if (drop > top_seen_cache_len) drop = top_seen_cache_len;
        for (size_t i = 0; i < drop; i++) {
            if (top_seen_cache_ids[i]) free(top_seen_cache_ids[i]);
        }
        memmove(top_seen_cache_ids, top_seen_cache_ids + drop, sizeof(char *) * (top_seen_cache_len - drop));
        memmove(top_seen_cache_counts, top_seen_cache_counts + drop, sizeof(int) * (top_seen_cache_len - drop));
        top_seen_cache_len -= drop;
        for (size_t i = top_seen_cache_len; i < TOP_SEEN_CACHE_LIMIT; i++) {
            top_seen_cache_ids[i] = NULL;
            top_seen_cache_counts[i] = 0;
        }
    }
    if (top_seen_cache_len >= top_seen_cache_cap) {
        size_t newcap = (top_seen_cache_cap == 0) ? 16 : top_seen_cache_cap * 2;
        char **new_ids = (char **)realloc(top_seen_cache_ids, sizeof(char *) * newcap);
        int *new_counts = (int *)realloc(top_seen_cache_counts, sizeof(int) * newcap);
        if (!new_ids || !new_counts) return;
        top_seen_cache_ids = new_ids;
        top_seen_cache_counts = new_counts;
        for (size_t i = top_seen_cache_cap; i < newcap; i++) top_seen_cache_ids[i] = NULL;
        for (size_t i = top_seen_cache_cap; i < newcap; i++) top_seen_cache_counts[i] = 0;
        top_seen_cache_cap = newcap;
    }
    if (top_seen_cache_len < TOP_SEEN_CACHE_LIMIT) {
        top_seen_cache_ids[top_seen_cache_len] = strdup(id);
        top_seen_cache_counts[top_seen_cache_len] = 1;
        top_seen_cache_len++;
    }
}

void clear_top_seen_cache(void) {
    if (!top_seen_cache_ids) return;
    for (size_t i = 0; i < top_seen_cache_len; i++) {
        if (top_seen_cache_ids[i]) free(top_seen_cache_ids[i]);
    }
    free(top_seen_cache_ids);
    free(top_seen_cache_counts);
    top_seen_cache_ids = NULL;
    top_seen_cache_counts = NULL;
    top_seen_cache_len = 0;
    top_seen_cache_cap = 0;
}

static int get_top_seen_count(const char *id) {
    int idx = top_seen_cache_find(id);
    if (idx < 0) return 0;
    return top_seen_cache_counts[idx];
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
    int has_community_note,
    double user_super_tweeter_boost
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
    if (!isfinite(user_super_tweeter_boost) || user_super_tweeter_boost < 0.0) user_super_tweeter_boost = 0.0;
    
    time_t now = time(NULL);
    double age_hours = compute_age_hours(now, created_at);
    
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
    
    double super_tweet_boost = 1.0;
    if (user_super_tweeter_boost > 0.0) {
        super_tweet_boost = user_super_tweeter_boost;
        if (age_hours < 24.0) {
            super_tweet_boost *= 4.0;
        } else {
            super_tweet_boost *= 2.5;
        }
    }
    
    double time_decay = calculate_time_decay(age_hours);
    
    double engagement_quality = calculate_engagement_quality(
        like_count, retweet_count, reply_count, quote_count
    );
    
    double virality_boost = calculate_virality_boost(
        like_count,
        retweet_count,
        reply_count,
        quote_count,
        follower_count,
        age_hours
    );
    
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
    if (hours_since_seen > 72.0) {
        novelty_boost *= 0.95;
    }
    novelty_boost = clampd(novelty_boost, 0.7, 1.5);

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
    
    double age_diversity = calculate_age_diversity_boost(like_count, retweet_count, reply_count, quote_count, age_hours);

    double engagement_ratio = safe_div((double)total_engagement, (double)safe_max(follower_count, ENGAGEMENT_FLOOR_DENOM), 0.0);
    if (engagement_ratio < MIN_ENGAGEMENT_RATIO && follower_count > 0) {
        double deficit = clampd((MIN_ENGAGEMENT_RATIO - engagement_ratio) * 20.0, 0.0, 0.6);
        age_diversity *= (1.0 - deficit * 0.25);
        media_boost *= (1.0 - deficit * 0.5);
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
                        random_multiplier *
                        super_tweet_boost;

    if (all_seen_flag) {
        final_score += random_component * 2.5;
    } else {
        final_score += random_component;
    }
    
    final_score *= age_diversity;

    if (content_repeats > 2) {
        double extra_pen = pow(0.7, (double)(content_repeats - 2));
        if (!isfinite(extra_pen) || extra_pen <= 0.0) extra_pen = 0.01;
        final_score *= extra_pen;
    }
    if (author_repeats > 3) {
        final_score *= 0.85;
    }

    if (final_score < 0.0) final_score = 0.0;
    if (!isfinite(final_score)) final_score = 0.0;
    
    return final_score;
}

static int compare_tweets(const void *a, const void *b) {
    if (a == NULL || b == NULL) return 0;

    const Tweet *tweet_a = (const Tweet *)a;
    const Tweet *tweet_b = (const Tweet *)b;

    if (tweet_a == NULL || tweet_b == NULL) return 0;

    if (tweet_b->score > tweet_a->score) return 1;
    if (tweet_b->score < tweet_a->score) return -1;

    if (tweet_b->created_at > tweet_a->created_at) return 1;
    if (tweet_b->created_at < tweet_a->created_at) return -1;

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
        srand((unsigned int)time(NULL) ^ (unsigned int)(uintptr_t)&seeded);
        seeded = 1;
    }

    time_t now_ts = time(NULL);
    size_t adaptive_window = compute_adaptive_window(count);
    size_t display_window = compute_display_window(count);
    double *age_hours_cache = (double *)calloc(count, sizeof(double));
    if (age_hours_cache) {
        for (size_t i = 0; i < count; i++) {
            age_hours_cache[i] = compute_age_hours(now_ts, tweets[i].created_at);
        }
    }

    unsigned int *dup_counts = (unsigned int *)calloc(count, sizeof(unsigned int));
    if (dup_counts) {
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
        tweets[i].random_factor = (double)rand() / (double)RAND_MAX;
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
            tweets[i].has_community_note,
            tweets[i].user_super_tweeter_boost
        );

        tweets[i].score = base_score;
        if (is_recent_top_id(tweets[i].id)) {
            int ct = 0;
            for (size_t r = 0; r < recent_top_count; r++) if (recent_top_ids[r] && tweets[i].id && strcmp(recent_top_ids[r], tweets[i].id) == 0) ct++;
            double rp = pow(0.6, (double)ct);
            if (rp < 0.12) rp = 0.12;
            tweets[i].score *= rp;
        }
        int top_seen_ct = get_top_seen_count(tweets[i].id);
        if (top_seen_ct > 2) {
            double sp = pow(0.85, (double)(top_seen_ct - 2));
            if (sp < 0.6) sp = 0.6;
            tweets[i].score *= sp;
        }
    }
    
    // --- Content clustering & author prevalence detection ---
    char **normalized_content = (char **)calloc(count, sizeof(char *));
    char ***token_sets = (char ***)calloc(count, sizeof(char **));
    size_t *token_counts = (size_t *)calloc(count, sizeof(size_t));
    int *cluster_ids = (int *)calloc(count, sizeof(int));
    if (cluster_ids) for (size_t i = 0; i < count; i++) cluster_ids[i] = -1;
    unsigned long *content_hashes = (unsigned long *)calloc(count, sizeof(unsigned long));
    int *author_prevalence = (int *)calloc(count, sizeof(int));
    int clustering_ready = normalized_content && token_sets && token_counts && cluster_ids && content_hashes && author_prevalence;

    int next_cluster = 0;
    int *cluster_counts = NULL;

    if (clustering_ready) {
        for (size_t i = 0; i < count; i++) {
            const char *cc = tweets[i].content ? tweets[i].content : (tweets[i].id ? tweets[i].id : "");
            normalized_content[i] = normalize_content_c(cc);
            token_sets[i] = extract_tokens(normalized_content[i], &token_counts[i]);
            content_hashes[i] = normalized_content[i] ? djb2_hash(normalized_content[i]) : 0;
            author_prevalence[i] = tweets[i].author_repeats + 1;
        }

        for (size_t i = 0; i < count; i++) {
            if (cluster_ids[i] != -1) continue;
            cluster_ids[i] = next_cluster;
            for (size_t j = i + 1; j < count; j++) {
                if (cluster_ids[j] != -1) continue;
                if (content_hashes[i] && content_hashes[j] && content_hashes[i] == content_hashes[j]) {
                    cluster_ids[j] = next_cluster;
                    continue;
                }
                double sim = token_similarity(token_sets[i], token_counts[i], token_sets[j], token_counts[j]);
                if (sim > 0.45) {
                    cluster_ids[j] = next_cluster;
                }
            }
            next_cluster++;
        }

        cluster_counts = (int *)calloc(next_cluster ? next_cluster : 1, sizeof(int));
        if (cluster_counts) {
            for (size_t i = 0; i < count; i++) {
                if (cluster_ids[i] >= 0 && cluster_ids[i] < next_cluster) cluster_counts[cluster_ids[i]]++;
            }
        }
    } else {
        next_cluster = 0;
    }

    // apply cluster & author penalties
    for (size_t i = 0; i < count; i++) {
        double penalty = 1.0;
        if (cluster_counts && cluster_ids[i] >= 0 && cluster_counts[cluster_ids[i]] > 1) {
            double cc = (double)cluster_counts[cluster_ids[i]];
            penalty *= 1.0 / (1.0 + (cc - 1) * 0.45);
        }
        if (author_prevalence[i] > 2) {
            // penalize authors that appear many times in the candidate set
            double ap = (double)author_prevalence[i];
            penalty *= 1.0 / (1.0 + (ap - 1) * 0.2);
        }
        // top_seens (recorded recently) make a stronger penalty
        int tsc = get_top_seen_count(tweets[i].id);
        if (tsc > 0) {
            double tpen = pow(0.82, (double)tsc);
            if (tpen < 0.3) tpen = 0.3;
            penalty *= tpen;
        }
        tweets[i].score *= penalty;
    }
    
    qsort(tweets, count, sizeof(Tweet), compare_tweets);

    // Rebuild normalization + cluster data post-sort to keep alignment with current order
    if (normalized_content) {
        for (size_t i = 0; i < count; i++) {
            if (normalized_content[i]) free(normalized_content[i]);
        }
        free(normalized_content);
    }
    if (token_sets) {
        for (size_t i = 0; i < count; i++) {
            if (token_sets[i]) free_tokens(token_sets[i], token_counts ? token_counts[i] : 0);
        }
        free(token_sets);
    }
    if (token_counts) free(token_counts);
    if (cluster_ids) free(cluster_ids);
    if (cluster_counts) free(cluster_counts);
    if (content_hashes) free(content_hashes);
    if (author_prevalence) free(author_prevalence);

    normalized_content = (char **)calloc(count, sizeof(char *));
    token_sets = (char ***)calloc(count, sizeof(char **));
    token_counts = (size_t *)calloc(count, sizeof(size_t));
    cluster_ids = (int *)calloc(count, sizeof(int));
    if (cluster_ids) for (size_t i = 0; i < count; i++) cluster_ids[i] = -1;
    content_hashes = (unsigned long *)calloc(count, sizeof(unsigned long));
    author_prevalence = (int *)calloc(count, sizeof(int));

    clustering_ready = normalized_content && token_sets && token_counts && cluster_ids && content_hashes && author_prevalence;
    if (clustering_ready) {
        for (size_t i = 0; i < count; i++) {
            const char *cc = tweets[i].content ? tweets[i].content : (tweets[i].id ? tweets[i].id : "");
            normalized_content[i] = normalize_content_c(cc);
            token_sets[i] = extract_tokens(normalized_content[i], &token_counts[i]);
            content_hashes[i] = normalized_content[i] ? djb2_hash(normalized_content[i]) : 0;
            author_prevalence[i] = tweets[i].author_repeats + 1;
        }

        next_cluster = 0;
        for (size_t i = 0; i < count; i++) {
            if (cluster_ids[i] != -1) continue;
            cluster_ids[i] = next_cluster;
            for (size_t j = i + 1; j < count; j++) {
                if (cluster_ids[j] != -1) continue;
                if (content_hashes[i] && content_hashes[j] && content_hashes[i] == content_hashes[j]) {
                    cluster_ids[j] = next_cluster;
                    continue;
                }
                double sim = token_similarity(token_sets[i], token_counts[i], token_sets[j], token_counts[j]);
                if (sim > 0.45) {
                    cluster_ids[j] = next_cluster;
                }
            }
            next_cluster++;
        }
        cluster_counts = (int *)calloc(next_cluster ? next_cluster : 1, sizeof(int));
        if (cluster_counts) {
            for (size_t i = 0; i < count; i++) {
                if (cluster_ids[i] >= 0 && cluster_ids[i] < next_cluster) cluster_counts[cluster_ids[i]]++;
            }
        }
    } else {
        next_cluster = 0;
    }

    for (size_t i = 0; i < count && i < adaptive_window; i++) {
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
            tweets[i].has_community_note,
            tweets[i].user_super_tweeter_boost
        );

        double penalty2 = 1.0;
        if (cluster_counts && cluster_ids && cluster_ids[i] >= 0 && cluster_counts[cluster_ids[i]] > 1) {
            double cc = (double)cluster_counts[cluster_ids[i]];
            penalty2 *= 1.0 / (1.0 + (cc - 1) * 0.35);
        }
        if (author_prevalence && author_prevalence[i] > 2) {
            penalty2 *= 1.0 / (1.0 + (double)(author_prevalence[i] - 2) * 0.25);
        }
        adjusted_score *= penalty2;

        tweets[i].score = adjusted_score;
        if (is_recent_top_id(tweets[i].id)) {
            int ct = 0;
            for (size_t r = 0; r < recent_top_count; r++) if (recent_top_ids[r] && tweets[i].id && strcmp(recent_top_ids[r], tweets[i].id) == 0) ct++;
            double rp = pow(0.6, (double)ct);
            if (rp < 0.12) rp = 0.12;
            tweets[i].score *= rp;
        }
        int top_seen_ct2 = get_top_seen_count(tweets[i].id);
        if (top_seen_ct2 > 2) {
            double sp = pow(0.85, (double)(top_seen_ct2 - 2));
            if (sp < 0.6) sp = 0.6;
            tweets[i].score *= sp;
        }
    }

    qsort(tweets, count, sizeof(Tweet), compare_tweets);

    size_t top_check = adaptive_window;
    for (int pass = 0; pass < 3; pass++) {
        size_t unique_count = 0;
        for (size_t i = 0; i < top_check; i++) {
            int found = 0;
            if (!tweets[i].id) continue;
            for (size_t j = 0; j < i; j++) {
                if (tweets[j].id && strcmp(tweets[j].id, tweets[i].id) == 0) { found = 1; break; }
            }
            if (!found) unique_count++;
        }
        if (unique_count >= (top_check * 70 / 100)) break;

        for (size_t i = 0; i < top_check; i++) {
            if (!tweets[i].id) continue;
            int dup_count = 0;
            for (size_t j = 0; j < top_check; j++) {
                if (tweets[j].id && strcmp(tweets[j].id, tweets[i].id) == 0) dup_count++;
            }
            if (dup_count > 1) {
                double penalty = pow(0.6, (double)(dup_count - 1));
                if (penalty < 0.12) penalty = 0.12;
                tweets[i].score *= penalty;
            }
        }
        qsort(tweets, count, sizeof(Tweet), compare_tweets);
    }

    if (count > 3) {
        double *scores = (double *)malloc(sizeof(double) * count);
        if (scores) {
            for (size_t i = 0; i < count; i++) scores[i] = tweets[i].score;
            qsort(scores, count, sizeof(double), compare_doubles);
            double median = scores[count / 2];
            if (median <= 0.0) median = 1.0;
            for (size_t i = 0; i < count; i++) {
                double limit_factor = 6.0 - fmin((double)i * 0.5, 4.0);
                double limit_value = median * limit_factor;
                if (tweets[i].score > limit_value) tweets[i].score = limit_value;
            }
            free(scores);
            qsort(tweets, count, sizeof(Tweet), compare_tweets);
        }
    }

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

    if (count > 1) {
        size_t window_bound = adaptive_window;
        if (window_bound > count) window_bound = count;
        size_t desired_older = (window_bound >= 6) ? 2 : 1;
        size_t older_present = 0;
        for (size_t i = 0; i < window_bound; i++) {
            double age_hours = age_hours_cache ? age_hours_cache[i] : compute_age_hours(now_ts, tweets[i].created_at);
            if (age_hours >= 6.0) {
                older_present++;
            }
        }

        if (older_present < desired_older) {
            for (size_t k = window_bound; k < count && older_present < desired_older; k++) {
                double candidate_age = age_hours_cache ? age_hours_cache[k] : compute_age_hours(now_ts, tweets[k].created_at);
                if (candidate_age < 6.0) continue;

                int duplicate_id = 0;
                if (tweets[k].id) {
                    for (size_t i = 0; i < window_bound; i++) {
                        if (tweets[i].id && strcmp(tweets[i].id, tweets[k].id) == 0) {
                            duplicate_id = 1;
                            break;
                        }
                    }
                }
                if (duplicate_id) continue;

                size_t swap_idx = SIZE_MAX;
                double youngest_age = 1e9;
                for (size_t i = 0; i < window_bound; i++) {
                    double age_hours = age_hours_cache ? age_hours_cache[i] : compute_age_hours(now_ts, tweets[i].created_at);
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

    size_t *buckets[5];
    size_t bucket_counts[5];
    size_t bucket_pos[5];
    for (int i = 0; i < 5; i++) {
        buckets[i] = (size_t *)calloc(count, sizeof(size_t));
        bucket_counts[i] = 0;
        bucket_pos[i] = 0;
    }

    for (size_t i = 0; i < count; i++) {
        double age_hours = age_hours_cache ? age_hours_cache[i] : compute_age_hours(now_ts, tweets[i].created_at);
        int bucket = 0;
        if (age_hours < 6.0) bucket = 0;
        else if (age_hours < 24.0) bucket = 1;
        else if (age_hours < 48.0) bucket = 2;
        else if (age_hours < 96.0) bucket = 3;
        else bucket = 4;

        buckets[bucket][bucket_counts[bucket]++] = i;
    }

    size_t window_bound = adaptive_window;
    if (window_bound > count) window_bound = count;
    size_t forced_old_needed = 0;
    size_t fresh_count_in_top = 0;
    for (size_t i = 0; i < window_bound; i++) {
        double age_hours = age_hours_cache ? age_hours_cache[i] : compute_age_hours(now_ts, tweets[i].created_at);
        if (age_hours < 6.0) fresh_count_in_top++;
    }
    if (fresh_count_in_top > (window_bound * 60 / 100)) {
        forced_old_needed = 2;
    } else if (fresh_count_in_top > (window_bound * 40 / 100)) {
        forced_old_needed = 1;
    }

    size_t *final_idx = (size_t *)malloc(sizeof(size_t) * count);
    if (!final_idx) {
        goto cleanup;
    }
    size_t selected = 0;

    int *selected_flags = (int *)calloc(count, sizeof(int));
    if (!selected_flags) { goto cleanup; }

    size_t selected_author_repeat_count = 0;
    size_t max_author_repeat_slots = window_bound < 4 ? window_bound : 4;
    size_t forced_old_selected = 0;

    for (size_t round = 0; round < (size_t)count && selected < count; round++) {
        int tried_any = 0;
        int order[5] = {0, 2, 1, 3, 4};
        for (int oi = 0; oi < 5 && selected < count; oi++) {
            int b = order[(round + oi) % 5];
            size_t pos = bucket_pos[b];
            if (pos >= bucket_counts[b]) continue;
            size_t idx = buckets[b][pos];
            if (selected_flags[idx]) { bucket_pos[b]++; continue; }
            tried_any = 1;
            if (tweets[idx].id) {
                int dup = 0;
                for (size_t s = 0; s < selected; s++) {
                    if (tweets[final_idx[s]].id && strcmp(tweets[final_idx[s]].id, tweets[idx].id) == 0) { dup = 1; break; }
                }
                if (dup) { bucket_pos[b]++; continue; }
            }
            if ((size_t)tweets[idx].author_repeats > 0 && selected_author_repeat_count >= max_author_repeat_slots) {
                bucket_pos[b]++;
                continue;
            }

            if (forced_old_needed > 0) {
                double age_hours = age_hours_cache ? age_hours_cache[idx] : compute_age_hours(now_ts, tweets[idx].created_at);
                if (age_hours < 24.0) {
                    bucket_pos[b]++;
                    continue;
                }
            }

            final_idx[selected] = idx;
            selected_flags[idx] = 1;
            if ((size_t)tweets[idx].author_repeats > 0) {
                selected_author_repeat_count++;
            }
            selected++;
            if (forced_old_needed > 0) {
                double age_hours = age_hours_cache ? age_hours_cache[idx] : compute_age_hours(now_ts, tweets[idx].created_at);
                if (age_hours >= 24.0) {
                    forced_old_selected++;
                    if (forced_old_selected >= forced_old_needed) {
                        forced_old_needed = 0;
                    }
                }
            }
            bucket_pos[b]++;
        }
        if (!tried_any) break;
        if (forced_old_needed == 0) {
            forced_old_selected = 0;
        }
    }

    for (size_t i = 0; i < count && selected < count; i++) {
        if (!selected_flags[i]) {
            final_idx[selected++] = i;
            selected_flags[i] = 1;
        }
    }

    if (selected == count) {
        Tweet *copy = (Tweet *)malloc(sizeof(Tweet) * count);
        if (copy) {
            for (size_t i = 0; i < count; i++) copy[i] = tweets[final_idx[i]];
            for (size_t i = 0; i < count; i++) tweets[i] = copy[i];
            free(copy);
        }
    }

    if (forced_old_needed > 0) {
        size_t current_older = 0;
        for (size_t i = 0; i < window_bound; i++) {
            double age_hours = age_hours_cache ? age_hours_cache[i] : compute_age_hours(now_ts, tweets[i].created_at);
            if (age_hours >= 24.0) current_older++;
        }
        if (current_older < forced_old_needed) {
            for (size_t k = window_bound; k < count && current_older < forced_old_needed; k++) {
                double candidate_age = age_hours_cache ? age_hours_cache[k] : compute_age_hours(now_ts, tweets[k].created_at);
                if (candidate_age < 24.0) continue;
                int conflict = 0;
                if (tweets[k].id) {
                    for (size_t t = 0; t < window_bound; t++) {
                        if (tweets[t].id && strcmp(tweets[t].id, tweets[k].id) == 0) { conflict = 1; break; }
                    }
                }
                if (conflict) continue;
                size_t youngest_idx = SIZE_MAX; double youngest_age = 1e9;
                for (size_t t = 0; t < window_bound; t++) {
                    double age_hours = age_hours_cache ? age_hours_cache[t] : compute_age_hours(now_ts, tweets[t].created_at);
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

    size_t primary_window = window_bound;
    if (primary_window > display_window) primary_window = display_window;
    size_t top_limit_adj = primary_window;
    for (size_t i = 0; i + 1 < top_limit_adj; i++) {
        if (!tweets[i].id || !tweets[i+1].id) continue;
        if (strcmp(tweets[i].id, tweets[i+1].id) == 0) {
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

    if (top_limit_adj > 2) {
        for (size_t i = 0; i < top_limit_adj; i++) {
            size_t j = i + (rand() % (top_limit_adj - i));
            if (j != i) {
                Tweet tmp = tweets[i];
                tweets[i] = tweets[j];
                tweets[j] = tmp;
            }
        }
    }

    if (count > 1) {
        int need_buckets[3] = {0,0,0};
        for (size_t i = 0; i < top_limit_adj; i++) {
            double age_hours = age_hours_cache ? age_hours_cache[i] : compute_age_hours(now_ts, tweets[i].created_at);
            if (age_hours >= 24.0 && age_hours < 48.0) need_buckets[0] = 1;
            if (age_hours >= 48.0 && age_hours < 96.0) need_buckets[1] = 1;
            if (age_hours >= 96.0) need_buckets[2] = 1;
        }
        for (int target = 0; target < 3; target++) {
            if (need_buckets[target]) continue;
            size_t candidate_idx = SIZE_MAX;
            for (size_t k = top_limit_adj; k < count; k++) {
                double age_hours = age_hours_cache ? age_hours_cache[k] : compute_age_hours(now_ts, tweets[k].created_at);
                int match = 0;
                if (target == 0 && age_hours >= 24.0 && age_hours < 48.0) match = 1;
                if (target == 1 && age_hours >= 48.0 && age_hours < 96.0) match = 1;
                if (target == 2 && age_hours >= 96.0) match = 1;
                if (!match) continue;
                int conflict = 0;
                if (tweets[k].id) {
                    for (size_t t = 0; t < top_limit_adj; t++) {
                        if (tweets[t].id && strcmp(tweets[t].id, tweets[k].id) == 0) { conflict = 1; break; }
                    }
                }
                if (!conflict) { candidate_idx = k; break; }
            }
            if (candidate_idx == SIZE_MAX) continue;
            size_t swap_idx = SIZE_MAX; double youngest_age = 1e9;
            for (size_t i = 0; i < top_limit_adj; i++) {
                double age_hours = age_hours_cache ? age_hours_cache[i] : compute_age_hours(now_ts, tweets[i].created_at);
                if (age_hours < youngest_age) { youngest_age = age_hours; swap_idx = i; }
            }
            if (swap_idx != SIZE_MAX) {
                Tweet tmp = tweets[swap_idx];
                tweets[swap_idx] = tweets[candidate_idx];
                tweets[candidate_idx] = tmp;
            }
        }
    }

    if (count > 1) {
        size_t top_limit_cr = top_limit_adj;
        size_t current_repeats = 0;
        for (size_t i = 0; i < top_limit_cr; i++) if (tweets[i].content_repeats > 0) current_repeats++;
        size_t allowed_repeats = (top_limit_cr * 30) / 100;
        for (size_t i = 0; i < top_limit_cr && current_repeats > allowed_repeats; i++) {
            if (tweets[i].content_repeats <= 0) continue;
            size_t swap_idx = SIZE_MAX;
            for (size_t j = top_limit_cr; j < count; j++) {
                if (tweets[j].content_repeats == 0) {
                    int conflict = 0;
                    if (tweets[j].id) {
                        for (size_t t = 0; t < top_limit_cr; t++) {
                            if (tweets[t].id && strcmp(tweets[t].id, tweets[j].id) == 0) { conflict = 1; break; }
                        }
                    }
                    if (!conflict) { swap_idx = j; break; }
                }
            }
            if (swap_idx != SIZE_MAX) {
                Tweet tmp = tweets[i];
                tweets[i] = tweets[swap_idx];
                tweets[swap_idx] = tmp;
                current_repeats--;
            }
        }
    }

    if (count > 1) {
        size_t top_limit_ah = top_limit_adj;
        size_t current_author_repeats = 0;
        for (size_t i = 0; i < top_limit_ah; i++) if (tweets[i].author_repeats > 0) current_author_repeats++;
        size_t allowed_author_repeats = (top_limit_ah * 30) / 100;
        for (size_t i = 0; i < top_limit_ah && current_author_repeats > allowed_author_repeats; i++) {
            if (tweets[i].author_repeats == 0) continue;
            size_t swap_idx = SIZE_MAX;
            for (size_t j = top_limit_ah; j < count; j++) {
                if (tweets[j].author_repeats == 0) {
                    int conflict = 0;
                    if (tweets[j].id) {
                        for (size_t t = 0; t < top_limit_ah; t++) {
                            if (tweets[t].id && strcmp(tweets[t].id, tweets[j].id) == 0) { conflict = 1; break; }
                        }
                    }
                    if (!conflict) { swap_idx = j; break; }
                }
            }
            if (swap_idx != SIZE_MAX) {
                Tweet tmp = tweets[i];
                tweets[i] = tweets[swap_idx];
                tweets[swap_idx] = tmp;
                current_author_repeats--;
            }
        }
    }

    if (cluster_ids && cluster_counts && count > 1) {
        if (cluster_ids[0] >= 0 && cluster_ids[1] >= 0 && cluster_ids[0] == cluster_ids[1]) {
            size_t swap_idx = SIZE_MAX;
            for (size_t j = 2; j < count; j++) {
                if (cluster_ids[j] != cluster_ids[0]) {
                    swap_idx = j;
                    break;
                }
            }
            if (swap_idx != SIZE_MAX) {
                Tweet tmp = tweets[1];
                tweets[1] = tweets[swap_idx];
                tweets[swap_idx] = tmp;
                int tmp_cluster = cluster_ids[1];
                cluster_ids[1] = cluster_ids[swap_idx];
                cluster_ids[swap_idx] = tmp_cluster;
                if (author_prevalence) {
                    int tmp_prev = author_prevalence[1];
                    author_prevalence[1] = author_prevalence[swap_idx];
                    author_prevalence[swap_idx] = tmp_prev;
                }
            }
        }
    }

/* finish label removed: unused. */
    if (count > 1 && display_window > 0) {
        randomize_front_window(tweets, count, display_window, now_ts, age_hours_cache, cluster_counts, cluster_ids, author_prevalence);
    }

    size_t record_top = display_window;
    if (record_top > count) record_top = count;
    for (size_t i = 0; i < record_top; i++) {
        if (tweets[i].id) record_top_shown(tweets[i].id);
    }

cleanup:
    if (age_hours_cache) free(age_hours_cache);
    if (normalized_content) {
        for (size_t i = 0; i < count; i++) {
            if (normalized_content[i]) free(normalized_content[i]);
        }
        free(normalized_content);
    }
    if (token_sets) {
        for (size_t i = 0; i < count; i++) {
            if (token_sets[i]) free_tokens(token_sets[i], token_counts ? token_counts[i] : 0);
        }
        free(token_sets);
    }
    if (token_counts) free(token_counts);
    if (cluster_ids) free(cluster_ids);
    if (content_hashes) free(content_hashes);
    if (cluster_counts) free(cluster_counts);
    if (author_prevalence) free(author_prevalence);
    if (dup_counts) free(dup_counts);
    for (int i = 0; i < 5; i++) if (buckets[i]) free(buckets[i]);
    if (final_idx) free(final_idx);
    if (selected_flags) free(selected_flags);
    return;
}

char *process_timeline(const char *json_input) {
    (void)json_input;
    return strdup("{\"ranked_ids\":[]}");
}
