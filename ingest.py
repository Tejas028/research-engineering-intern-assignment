import json
import duckdb
from datetime import datetime, timezone
import os

def process_data():
    all_fields = [
        'approved_at_utc', 'subreddit', 'selftext', 'author_fullname', 'saved',
        'mod_reason_title', 'gilded', 'clicked', 'title', 'link_flair_richtext',
        'subreddit_name_prefixed', 'hidden', 'pwls', 'link_flair_css_class', 'downs',
        'thumbnail_height', 'top_awarded_type', 'hide_score', 'name', 'quarantine',
        'link_flair_text_color', 'upvote_ratio', 'author_flair_background_color',
        'subreddit_type', 'ups', 'total_awards_received', 'thumbnail_width',
        'author_flair_template_id', 'is_original_content', 'user_reports',
        'secure_media', 'is_reddit_media_domain', 'is_meta', 'category',
        'link_flair_text', 'can_mod_post', 'score', 'approved_by',
        'is_created_from_ads_ui', 'author_premium', 'thumbnail', 'edited',
        'author_flair_css_class', 'author_flair_richtext', 'content_categories',
        'is_self', 'mod_note', 'created', 'link_flair_type', 'wls',
        'removed_by_category', 'banned_by', 'author_flair_type', 'domain',
        'allow_live_comments', 'selftext_html', 'likes', 'suggested_sort',
        'banned_at_utc', 'view_count', 'archived', 'no_follow', 'is_crosspostable',
        'pinned', 'over_18', 'all_awardings', 'awarders', 'media_only', 'can_gild',
        'spoiler', 'locked', 'author_flair_text', 'treatment_tags', 'visited',
        'removed_by', 'num_reports', 'distinguished', 'subreddit_id',
        'author_is_blocked', 'mod_reason_by', 'removal_reason',
        'link_flair_background_color', 'id', 'is_robot_indexable', 'report_reasons',
        'author', 'discussion_type', 'num_comments', 'send_replies', 'contest_mode',
        'mod_reports', 'author_patreon_flair', 'author_flair_text_color',
        'permalink', 'stickied', 'url', 'subreddit_subscribers', 'created_utc',
        'num_crossposts', 'media', 'is_video'
    ]

    fields_int = {'score', 'ups', 'downs', 'num_comments', 'num_crossposts', 'gilded', 'total_awards_received'}
    fields_float = {'upvote_ratio'}
    fields_bool = {
        'saved', 'clicked', 'hidden', 'quarantine', 'hide_score', 'is_original_content',
        'is_reddit_media_domain', 'is_meta', 'can_mod_post', 'author_premium', 'is_self',
        'archived', 'no_follow', 'is_crosspostable', 'pinned', 'over_18', 'media_only',
        'can_gild', 'spoiler', 'locked', 'visited', 'author_is_blocked', 'is_robot_indexable',
        'send_replies', 'contest_mode', 'author_patreon_flair', 'stickied', 'is_video',
        'is_created_from_ads_ui', 'allow_live_comments'
    }

    computed_fields = [
        'is_automod', 'is_deleted', 'text_content', 'post_hour',
        'post_date', 'controversy_score', 'is_external_link', 'ideological_group'
    ]

    insert_fields = all_fields + computed_fields
    placeholders = ', '.join(['?'] * len(insert_fields))
    insert_query = f"INSERT INTO posts ({', '.join(insert_fields)}) VALUES ({placeholders})"

    rows_to_insert = []
    
    # Process jsonl
    if os.path.exists('data.jsonl'):
        with open('data.jsonl', 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                    
                if 'data' not in record:
                    continue
                
                data = record['data']
                
                orig_author = data.get('author')
                is_automod = orig_author == 'AutoModerator'
                is_deleted = orig_author == '[deleted]'
                
                author = orig_author
                if author in ('[deleted]', 'AutoModerator'):
                    author = None
                    
                selftext = data.get('selftext')
                if selftext in ('[deleted]', '[removed]', ''):
                    selftext = None
                    
                raw_cutc = data.get('created_utc')
                try:
                    cutc_dt = datetime.fromtimestamp(float(raw_cutc), tz=timezone.utc)
                except (TypeError, ValueError):
                    cutc_dt = datetime.fromtimestamp(0, tz=timezone.utc)
                    
                raw_c = data.get('created')
                try:
                    c_dt = datetime.fromtimestamp(float(raw_c), tz=timezone.utc)
                except (TypeError, ValueError):
                    c_dt = datetime.fromtimestamp(0, tz=timezone.utc)
                    
                title = data.get('title')
                title_str = str(title) if title is not None else ""
                
                text_content = title_str + " " + (selftext if selftext is not None else "")
                
                post_hour = cutc_dt.hour
                post_date = cutc_dt.strftime('%Y-%m-%d')
                
                upvote_ratio = data.get('upvote_ratio', 0.0)
                try:
                    upvote_ratio = float(upvote_ratio) if upvote_ratio is not None else 0.0
                except (ValueError, TypeError):
                    upvote_ratio = 0.0
                    
                num_comments = data.get('num_comments', 0)
                try:
                    num_comments = int(num_comments) if num_comments is not None else 0
                except (ValueError, TypeError):
                    num_comments = 0
                    
                controversy_score = round((1.0 - upvote_ratio) * num_comments, 2)
                
                is_self = data.get('is_self')
                is_self = bool(is_self) if is_self is not None else False
                is_external_link = not is_self
                
                subreddit = data.get('subreddit')
                subreddit_str = str(subreddit) if subreddit is not None else ""
                
                if subreddit_str in ('Anarchism', 'socialism', 'democrats', 'Liberal'):
                    ideological_group = 'left'
                elif subreddit_str in ('Conservative', 'Republican'):
                    ideological_group = 'right'
                elif subreddit_str in ('politics', 'neoliberal', 'worldpolitics', 'PoliticalDiscussion'):
                    ideological_group = 'center'
                else:
                    ideological_group = None
                    
                row_tuple = []
                for field in all_fields:
                    val = data.get(field)
                    
                    if field == 'created_utc':
                        row_tuple.append(cutc_dt)
                    elif field == 'created':
                        row_tuple.append(c_dt)
                    elif field == 'author':
                        row_tuple.append(author)
                    elif field == 'selftext':
                        row_tuple.append(selftext)
                    elif field == 'upvote_ratio':
                        row_tuple.append(upvote_ratio)
                    elif field == 'is_self':
                        row_tuple.append(is_self)
                    elif field == 'subreddit':
                        row_tuple.append(subreddit_str)
                    elif field == 'title':
                        row_tuple.append(title_str)
                    elif field in ('id', 'author_fullname'):
                        row_tuple.append(str(val) if val is not None else '')
                    elif field in fields_int:
                        try:
                            row_tuple.append(int(val) if val is not None else 0)
                        except (ValueError, TypeError):
                            row_tuple.append(0)
                    elif field in fields_float:
                        try:
                            row_tuple.append(float(val) if val is not None else 0.0)
                        except (ValueError, TypeError):
                            row_tuple.append(0.0)
                    elif field in fields_bool:
                        row_tuple.append(bool(val) if val is not None else False)
                    else:
                        if isinstance(val, (dict, list)):
                            row_tuple.append(json.dumps(val))
                        elif val is not None:
                            row_tuple.append(str(val))
                        else:
                            row_tuple.append(None)
                            
                row_tuple.extend([
                    is_automod, is_deleted, text_content, post_hour,
                    post_date, controversy_score, is_external_link, ideological_group
                ])
                
                rows_to_insert.append(tuple(row_tuple))
    else:
        print("Warning: data.jsonl not found in current directory. Proceeding to create db with no rows.")

    with duckdb.connect('narrativenet.db') as con:
        table_schema_defs = []
        for field in all_fields:
            if field in ('id', 'subreddit', 'author_fullname', 'title'):
                table_schema_defs.append(f"{field} TEXT NOT NULL")
            elif field == 'created_utc':
                table_schema_defs.append(f"{field} TIMESTAMP NOT NULL")
            elif field == 'created':
                table_schema_defs.append(f"{field} TIMESTAMP")
            elif field in fields_int:
                table_schema_defs.append(f"{field} INTEGER")
            elif field in fields_float:
                table_schema_defs.append(f"{field} DOUBLE")
            elif field in fields_bool:
                table_schema_defs.append(f"{field} BOOLEAN")
            else:
                table_schema_defs.append(f"{field} TEXT")
                
        table_schema_defs.extend([
            "is_automod BOOLEAN",
            "is_deleted BOOLEAN",
            "text_content TEXT",
            "post_hour INTEGER",
            "post_date TEXT",
            "controversy_score DOUBLE",
            "is_external_link BOOLEAN",
            "ideological_group TEXT"
        ])
        
        con.execute(f"CREATE OR REPLACE TABLE posts ({', '.join(table_schema_defs)})")
        
        if rows_to_insert:
            con.executemany(insert_query, rows_to_insert)
            
        con.execute("CREATE INDEX IF NOT EXISTS idx_subreddit ON posts(subreddit)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_author ON posts(author)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_created_utc ON posts(created_utc)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_ideological_group ON posts(ideological_group)")
        con.execute("CREATE INDEX IF NOT EXISTS idx_post_date ON posts(post_date)")
        
        print("\n--- Verification Component ---")
        
        res = con.execute("SELECT COUNT(*) FROM posts").fetchone()
        print(f"Total row count: {res[0]}")
        
        res = con.execute("SELECT subreddit, COUNT(*) FROM posts GROUP BY subreddit ORDER BY COUNT(*) DESC").fetchall()
        print("\nRow count per subreddit:")
        for r in res:
            print(f"  {r[0]}: {r[1]}")
            
        res = con.execute("SELECT ideological_group, COUNT(*) FROM posts GROUP BY ideological_group ORDER BY COUNT(*) DESC").fetchall()
        print("\nRow count per ideological_group:")
        for r in res:
            print(f"  {r[0]}: {r[1]}")
            
        res = con.execute("SELECT MIN(created_utc), MAX(created_utc) FROM posts").fetchone()
        print(f"\nDate range: {res[0]} to {res[1]}")
        
        res = con.execute("SELECT subreddit, AVG(score) as avg_score, AVG(upvote_ratio) as avg_ur, AVG(num_comments) as avg_nc FROM posts GROUP BY subreddit ORDER BY subreddit").fetchall()
        print("\nAverage score, upvote_ratio, num_comments per subreddit:")
        for r in res:
            avg_score = r[1] if r[1] is not None else 0.0
            avg_ur = r[2] if r[2] is not None else 0.0
            avg_nc = r[3] if r[3] is not None else 0.0
            print(f"  {r[0]}: score={avg_score:.2f}, ratio={avg_ur:.2f}, comments={avg_nc:.2f}")
            
        res = con.execute("""
            SELECT 
                SUM(CASE WHEN is_automod THEN 1 ELSE 0 END),
                SUM(CASE WHEN is_deleted THEN 1 ELSE 0 END),
                SUM(CASE WHEN is_external_link THEN 1 ELSE 0 END)
            FROM posts
        """).fetchone()
        print(f"\nCounts:")
        print(f"  is_automod=True: {res[0] or 0}")
        print(f"  is_deleted=True: {res[1] or 0}")
        print(f"  is_external_link=True: {res[2] or 0}")
        
        res = con.execute("SELECT author, COUNT(*) FROM posts WHERE author IS NOT NULL GROUP BY author ORDER BY COUNT(*) DESC LIMIT 10").fetchall()
        print("\nTop 10 most active authors:")
        for r in res:
            print(f"  {r[0]}: {r[1]}")

        print("\nIngestion complete. narrativenet.db ready.")

if __name__ == '__main__':
    process_data()
