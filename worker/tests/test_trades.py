import json
import httpx
import pytest
from worker.espn import ESPNClient, SyncError
from worker.trades import fetch_trades

def topic(id='trade'):
    return {'id':id,'date':1791000000000,'totalMessageCount':4,'messages':[
        {'messageTypeId':244,'targetId':100,'from':1,'to':2},
        {'messageTypeId':244,'targetId':200,'from':2,'to':1},
        {'messageTypeId':244,'targetId':200,'from':2,'to':1},
        {'messageTypeId':179,'targetId':300,'from':1,'to':0}]}

def test_completed_trade_normalization_and_filters():
    def handle(r):
        assert r.method=='GET'
        assert r.url.path.endswith('/communication/')
        filters=json.loads(r.headers['x-fantasy-filter'])['topics']
        assert filters['filterIncludeMessageTypeIds']['value']==[244]
        return httpx.Response(200,json={'topics':[topic()]})
    with ESPNClient(1,2027,transport=httpx.MockTransport(handle)) as client:
        trades=fetch_trades(client)
    assert len(trades)==1
    assert trades[0]['moves']==[{'playerId':100,'fromTeamId':1,'toTeamId':2},{'playerId':200,'fromTeamId':2,'toTeamId':1}]
    assert trades[0]['completedAt'].endswith('+00:00')

def test_pagination_fetches_all_and_rejects_repeated_ids():
    offsets=[]
    def handle(r):
        offset=json.loads(r.headers['x-fantasy-filter'])['topics']['offset']; offsets.append(offset)
        return httpx.Response(200,json={'topics':[topic(str(i)) for i in range(100)] if offset==0 else [topic('last')]})
    with ESPNClient(1,2027,transport=httpx.MockTransport(handle)) as client:
        assert len(fetch_trades(client))==101
    assert offsets==[0,100]
    with ESPNClient(1,2027,transport=httpx.MockTransport(lambda r:httpx.Response(200,json={'topics':[topic('same')]*100}))) as client:
        with pytest.raises(SyncError,match='pagination'): fetch_trades(client)

@pytest.mark.parametrize('payload',[{}, {'topics':[{'id':'bad','date':1791000000000,'messages':[{'messageTypeId':244,'targetId':1,'from':None,'to':2}]}]}])
def test_malformed_history_is_not_silently_empty(payload):
    with ESPNClient(1,2027,transport=httpx.MockTransport(lambda r:httpx.Response(200,json=payload))) as client:
        with pytest.raises(SyncError): fetch_trades(client)
