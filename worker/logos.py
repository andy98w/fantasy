"""Cache private ESPN team uploads without exposing session cookies to visitors."""
import base64
import re
import httpx

CUSTOM_LOGO = re.compile(r'^https://mystique-api\.fantasy\.espn\.com/apis/v1/domains/lm/images/[a-zA-Z0-9-]+$')
MAX_BYTES = 256 * 1024

def image_type(data):
    if data.startswith(b'\xff\xd8\xff'): return 'image/jpeg'
    if data.startswith(b'\x89PNG\r\n\x1a\n'): return 'image/png'
    if data.startswith((b'GIF87a', b'GIF89a')): return 'image/gif'
    if data.startswith(b'RIFF') and data[8:12] == b'WEBP': return 'image/webp'
    return None

def cache_team_logos(teams, espn_s2, swid, *, transport=None):
    failed = 0
    # Cookies are sent only to the exact ESPN upload endpoint, never redirects or custom hosts.
    with httpx.Client(timeout=15, follow_redirects=False, transport=transport) as client:
        for team in teams:
            url = team.get('logoUrl')
            if not url or not CUSTOM_LOGO.fullmatch(url): continue
            team['logoUrl'] = None
            try:
                with client.stream('GET', url, cookies={'espn_s2': espn_s2, 'SWID': swid}) as response:
                    response.raise_for_status()
                    content = bytearray()
                    for chunk in response.iter_bytes():
                        content.extend(chunk)
                        if len(content) > MAX_BYTES: raise ValueError('Image too large')
                mime = image_type(content)
                if not mime: raise ValueError('Unsupported image')
                team['logoUrl'] = f'data:{mime};base64,{base64.b64encode(content).decode("ascii")}'
            except (httpx.HTTPError, ValueError):
                failed += 1
    return [f'{failed} custom team logo(s) unavailable; abbreviations are shown instead.'] if failed else []
