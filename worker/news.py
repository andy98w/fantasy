"""RSS ingestion stores headline + canonical link only, never article bodies."""
import calendar
import hashlib
import re
from datetime import datetime, timezone
from urllib.parse import urlparse, urlunparse
import feedparser
import httpx

FEEDS={
    'RotoWire':'https://www.rotowire.com/rss/news.php?sport=NBA',
    'ESPN':'https://www.espn.com/espn/rss/nba/news',
}

def collect_news(players, previous=None):
    items={item['id']:item for item in (previous or [])}
    warnings=[]
    with httpx.Client(timeout=20,follow_redirects=True) as client:
        for source,url in FEEDS.items():
            try:
                response=client.get(url)
                response.raise_for_status()
                feed=feedparser.parse(response.content)
                if not feed.entries: raise ValueError('Empty feed')
                for entry in feed.entries:
                    link=entry.get('link','')
                    parts=urlparse(link)
                    if parts.scheme not in ('https','http') or not parts.netloc: continue
                    canonical=urlunparse((parts.scheme,parts.netloc,parts.path,'',parts.query,''))
                    title=entry.get('title','').strip()
                    if not title: continue
                    published=entry.get('published_parsed') or entry.get('updated_parsed')
                    date=datetime.fromtimestamp(calendar.timegm(published),timezone.utc).isoformat() if published else None
                    # Conservative full-name matching; ambiguous aliases remain unlinked.
                    lower=title.casefold()
                    ids=[p['id'] for p in players if re.search(r'(?<!\w)'+re.escape(p['name'].casefold())+r'(?!\w)',lower)]
                    identifier=hashlib.sha256(f'{source}:{canonical}:{title}'.encode()).hexdigest()[:24]
                    items[identifier]={'id':identifier,'source':source,'title':title,'url':canonical,
                        'publishedAt':date,'playerIds':ids}
            except (httpx.HTTPError,ValueError):
                warnings.append(f'{source} news unavailable; previously collected headlines retained.')
    return sorted(items.values(),key=lambda x:x['publishedAt'] or '',reverse=True)[:500],warnings
