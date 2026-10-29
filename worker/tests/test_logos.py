import httpx
from worker.logos import cache_team_logos, MAX_BYTES

URL = 'https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/test-logo'

def test_private_logo_cached_and_cookies_only_sent_to_espn():
    seen = []
    def respond(request):
        seen.append(request)
        return httpx.Response(200, content=b'\xff\xd8\xfftest')
    teams = [{'logoUrl': URL}, {'logoUrl': 'https://example.com/logo.png'}]
    assert cache_team_logos(teams, 'session-secret', '{swid}', transport=httpx.MockTransport(respond)) == []
    assert len(seen) == 1 and str(seen[0].url) == URL
    assert 'session-secret' in seen[0].headers['cookie']
    assert teams[0]['logoUrl'].startswith('data:image/jpeg;base64,')
    assert 'session-secret' not in str(teams)
    assert teams[1]['logoUrl'] == 'https://example.com/logo.png'

def test_redirects_errors_and_oversized_or_nonimage_responses_fall_back():
    for status, content in [(302, b''), (401, b''), (200, b'<svg>unsafe</svg>'), (200, b'\xff\xd8\xff' + b'x' * MAX_BYTES)]:
        teams = [{'logoUrl': URL}]
        requests = []
        def respond(request):
            requests.append(request)
            return httpx.Response(status, content=content, headers={'location': 'https://example.com/stolen'})
        warnings = cache_team_logos(teams, 'secret', 'secret', transport=httpx.MockTransport(respond))
        assert len(requests) == 1
        assert teams[0]['logoUrl'] is None and len(warnings) == 1
