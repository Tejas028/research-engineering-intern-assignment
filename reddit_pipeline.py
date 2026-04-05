import pandas as pd
import json
import duckdb
from pathlib import Path
from urllib.parse import urlparse

def process_reddit_data(raw_dir: str, processed_dir: str):
    raw_path = Path(raw_dir)
    processed_path = Path(processed_dir)
    
    # Create processed directory if it doesn't exist
    processed_path.mkdir(parents=True, exist_ok=True)
    
    # ---------------------------------------------------------
    # 1. Read JSONL files with error handling
    # ---------------------------------------------------------
    print(f"Reading JSONL files from {raw_path}...")
    records = []
    
    if not raw_path.exists():
        print(f"Error: Directory {raw_path} does not exist.")
        return

    jsonl_files = list(raw_path.glob('*.jsonl'))
    if not jsonl_files:
        print(f"No JSONL files found in {raw_path}.")
        return

    for file_path in jsonl_files:
        print(f"  Processing {file_path.name}...")
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                    records.append(record)
                except Exception as e:
                    # Silently skip malformed lines as requested
                    continue

    if not records:
        print("No valid records found.")
        return
        
    print(f"Loaded {len(records)} records. Normalizing JSON structure...")
    df = pd.json_normalize(records)
    
    # ---------------------------------------------------------
    # 2. Flatten "data." prefix
    # ---------------------------------------------------------
    print("Flattening 'data.' prefix from column names...")
    df.columns = [col.replace('data.', '', 1) if col.startswith('data.') else col for col in df.columns]
    
    # ---------------------------------------------------------
    # 3. Clean and normalize
    # ---------------------------------------------------------
    print("Cleaning and normalizing data...")
    
    # Parse created_utc to datetime with UTC
    if 'created_utc' in df.columns:
        df['created_utc'] = pd.to_datetime(df['created_utc'], unit='s', errors='coerce', utc=True)
        
    # Strip and lowercase selftext and replace empties with None
    if 'selftext' in df.columns:
        df['selftext'] = df['selftext'].astype(str).str.strip().str.lower()
        empty_vals = ['[removed]', '[deleted]', '', 'nan', 'none', 'null']
        df.loc[df['selftext'].isin(empty_vals), 'selftext'] = None
    else:
        df['selftext'] = None
        
    # Strip and lowercase title
    if 'title' in df.columns:
        df['title'] = df['title'].astype(str).str.strip().str.lower()
    else:
        df['title'] = None
        
    # Normalize subreddit names
    if 'subreddit' in df.columns:
        df['subreddit'] = df['subreddit'].astype(str).str.lower()
        
    # Extract domain from url if domain is null
    if 'url' in df.columns:
        extracted_domains = df['url'].apply(lambda x: urlparse(str(x)).netloc if pd.notnull(x) and x != "" else None)
        if 'domain' in df.columns:
            df['domain'] = df['domain'].fillna(extracted_domains)
        else:
            df['domain'] = extracted_domains
            
    # Cast score and num_comments to int
    for col in ['score', 'num_comments']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
            
    # Cast upvote_ratio to float
    if 'upvote_ratio' in df.columns:
        df['upvote_ratio'] = pd.to_numeric(df['upvote_ratio'], errors='coerce').fillna(0.0).astype(float)
        
    # ---------------------------------------------------------
    # 4. Derive new columns
    # ---------------------------------------------------------
    print("Deriving new columns...")
    
    # post_hour and post_day
    if 'created_utc' in df.columns:
        df['post_hour'] = df['created_utc'].dt.hour
        df['post_day'] = df['created_utc'].dt.day_name()
    else:
        df['post_hour'] = None
        df['post_day'] = None
        
    # content_length
    df['content_length'] = df['selftext'].fillna('').str.len() + df['title'].fillna('').str.len()
    
    # has_external_url
    if 'is_self' in df.columns:
        # Use is_self flag if available
        df['has_external_url'] = ~df['is_self'].astype(bool)
    elif 'domain' in df.columns:
        # Fallback to checking if domain resembles a self post
        df['has_external_url'] = ~df['domain'].astype(str).str.startswith('self.')
    else:
        df['has_external_url'] = False
        
    # text_combined
    df['text_combined'] = df['title'].fillna('') + " " + df['selftext'].fillna('')
    df['text_combined'] = df['text_combined'].str.strip()
    
    # controversy_score
    if 'upvote_ratio' in df.columns and 'num_comments' in df.columns:
        df['controversy_score'] = (1 - df['upvote_ratio']) * df['num_comments']
    else:
        df['controversy_score'] = 0.0
        
    # ---------------------------------------------------------
    # 5. Load into DuckDB
    # ---------------------------------------------------------
    duckdb_path = processed_path / 'reddit.duckdb'
    print(f"Loading cleaned data into DuckDB at {duckdb_path}...")
    
    conn = duckdb.connect(str(duckdb_path))
    conn.execute("DROP TABLE IF EXISTS posts")
    conn.execute("CREATE TABLE posts AS SELECT * FROM df")
    
    # ---------------------------------------------------------
    # 6. Diagnostic queries
    # ---------------------------------------------------------
    print("\n" + "="*40)
    print("DIAGNOSTIC REPORT")
    print("="*40)
    
    # Total post count
    total_posts = conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0]
    print(f"Total post count: {total_posts}")
    
    # Date range
    if 'created_utc' in df.columns:
        min_date, max_date = conn.execute("SELECT MIN(created_utc), MAX(created_utc) FROM posts").fetchone()
        print(f"Date range: {min_date} to {max_date}")
        
    # Top 20 subreddits
    if 'subreddit' in df.columns:
        print("\nTop 20 subreddits by post count:")
        top_subs = conn.execute('''
            SELECT subreddit, COUNT(*) as post_count 
            FROM posts 
            GROUP BY subreddit 
            ORDER BY post_count DESC 
            LIMIT 20
        ''').df()
        print(top_subs.to_string(index=False))
        
    # Null rate for selftext
    if 'selftext' in df.columns:
        null_rate_res = conn.execute('''
            SELECT SUM(CASE WHEN selftext IS NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*) 
            FROM posts
        ''').fetchone()[0]
        null_rate = null_rate_res if null_rate_res is not None else 0.0
        print(f"\nNull rate for selftext: {null_rate:.2f}%")
        
    # Distribution of posts by hour of day
    if 'post_hour' in df.columns:
        print("\nDistribution of posts by hour of day:")
        hour_dist = conn.execute('''
            SELECT post_hour, COUNT(*) as post_count 
            FROM posts 
            GROUP BY post_hour 
            ORDER BY post_hour
        ''').df()
        print(hour_dist.to_string(index=False))
        
    # Average controversy_score by subreddit (Top 20 by post count)
    if 'subreddit' in df.columns and 'controversy_score' in df.columns:
        print("\nAverage controversy_score by subreddit (Top 20 by volume):")
        controversy_stats = conn.execute('''
            SELECT subreddit, AVG(controversy_score) as avg_controversy, COUNT(*) as post_count
            FROM posts 
            GROUP BY subreddit 
            ORDER BY post_count DESC 
            LIMIT 20
        ''').df()
        print(controversy_stats[['subreddit', 'avg_controversy']].to_string(index=False))
        
    conn.close()
    
    # ---------------------------------------------------------
    # 7. Save to Parquet
    # ---------------------------------------------------------
    parquet_path = processed_path / 'posts_clean.parquet'
    print(f"\nSaving cleaned Parquet dataset to {parquet_path}...")
    df.to_parquet(parquet_path, index=False)
    
    print("\nPipeline completed successfully!")

if __name__ == '__main__':
    # Determine absolute path relative to where script is executed, or current working directory
    base_dir = Path.cwd()
    
    raw_data_dir = base_dir / 'data' / 'raw'
    processed_data_dir = base_dir / 'data' / 'processed'
    
    # Create the raw directory structure if it doesn't exist
    raw_data_dir.mkdir(parents=True, exist_ok=True)
    
    process_reddit_data(str(raw_data_dir), str(processed_data_dir))
