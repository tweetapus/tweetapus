#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include "../src/algo/algorithm.h"

int main(void) {
    Tweet tweets[5];

    for (int i = 0; i < 5; i++) {
        tweets[i].id = (char *)malloc(16);
        snprintf(tweets[i].id, 16, "tweet_%d", i < 3 ? 0 : i);
        tweets[i].created_at = (long long)(time(NULL) - i * 7200);
        tweets[i].like_count = (i + 1) * 10;
        tweets[i].retweet_count = (i + 1) * 2;
        tweets[i].reply_count = i;
        tweets[i].quote_count = i / 2;
        tweets[i].has_media = i % 2;
        tweets[i].seen_count = 0;
        tweets[i].hours_since_seen = -1;
        tweets[i].author_repeats = i % 2;
        tweets[i].content_repeats = 0;
        tweets[i].novelty_factor = 1.0;
        tweets[i].random_factor = 0.5;
        tweets[i].all_seen_flag = 0;
        tweets[i].user_verified = 0;
        tweets[i].user_gold = 0;
        tweets[i].follower_count = 100;
        tweets[i].has_community_note = 0;
        tweets[i].score = 0.0;
    }

    rank_tweets(tweets, 5);

    printf("Ranked tweets (score, id, age hours):\n");
    for (int i = 0; i < 5; i++) {
        double age_hours = (double)(time(NULL) - tweets[i].created_at) / 3600.0;
        printf("%d: %.3f %s %.2f\n", i + 1, tweets[i].score, tweets[i].id, age_hours);
    }

    for (int i = 0; i < 5; i++) {
        free(tweets[i].id);
    }

    return 0;
}
