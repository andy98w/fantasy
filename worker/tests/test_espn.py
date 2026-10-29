import httpx
import pytest
from worker.espn import ESPNClient, SyncError

@pytest.mark.parametrize('code',[401,403])
def test_access_denied_does_not_expose_cookies_or_response_body(code):
    transport=httpx.MockTransport(lambda r:httpx.Response(code,json={'private':'SECRET_COOKIE'}))
    with ESPNClient(1,2027,'SECRET_COOKIE','secret',transport=transport) as client:
        with pytest.raises(SyncError) as error: client.get(client.league)
    assert 'SECRET_COOKIE' not in str(error.value)
    assert 'access denied' in str(error.value)

def test_repeated_pagination_is_rejected():
    def handle(r):
        assert r.method=='GET'
        if r.url.params.get('view')=='kona_player_info':
            return httpx.Response(200,json={'players':[{'player':{'id':i+1}} for i in range(250)]})
        if 'mSettings' in r.url.params.get_list('view'):
            return httpx.Response(200,json={'teams':[{'id':1}],'settings':{},'status':{'currentMatchupPeriod':1},'scoringPeriodId':1})
        return httpx.Response(200,json={'schedule':[]})
    with ESPNClient(1,2027,transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(SyncError,match='pagination'): client.fetch()

def test_network_retry_is_bounded(monkeypatch):
    monkeypatch.setattr('worker.espn.time.sleep',lambda _:None)
    calls=[]
    def handle(r):
        calls.append(r);return httpx.Response(503)
    with ESPNClient(1,2027,transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(SyncError): client.get(client.league)
    assert len(calls)==3
