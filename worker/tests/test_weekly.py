from copy import deepcopy
from worker.weekly import weekly_players, COUNTS

def side():
    raw = {key: 0 for key in COUNTS}
    raw.update({'0': 12, '13': 5, '14': 10, '15': 2, '16': 2, '42': 1})
    return {'rosterForMatchupPeriod': {'entries': [{'playerPoolEntry': {'player': {
        'id': 1, 'fullName': 'A Player', 'stats': [
            {'seasonId': 2027, 'statSourceId': 0, 'statSplitTypeId': 0, 'stats': {'0': 999}},
            {'seasonId': 2027, 'statSourceId': 0, 'statSplitTypeId': 5, 'stats': raw}
        ]
    }}}]}, 'cumulativeScore': {'scoreByStat': {key: {'score': raw[key]} for key in COUNTS}}}

def test_weekly_splits_and_reconciliation():
    players, complete = weekly_players(side(), 2027)
    assert complete
    assert players[0]['stats']['PTS'] == 12
    assert players[0]['stats']['FG%'] == .5
    assert players[0]['stats']['FT%'] == 1

def test_incomplete_or_mismatched_totals_do_not_claim_complete():
    value = side()
    value['cumulativeScore']['scoreByStat']['0']['score'] = 13
    assert weekly_players(value, 2027)[1] is False
    value = side()
    del value['rosterForMatchupPeriod']['entries'][0]['playerPoolEntry']['player']['stats'][1]['stats']['1']
    assert weekly_players(value, 2027)[1] is False
    assert weekly_players({}, 2027) == ([], False)

def test_duplicate_players_or_ambiguous_splits_are_incomplete():
    value = side()
    value['rosterForMatchupPeriod']['entries'] *= 2
    assert weekly_players(value, 2027)[1] is False
    value = side()
    stats = value['rosterForMatchupPeriod']['entries'][0]['playerPoolEntry']['player']['stats']
    stats.append(deepcopy(stats[-1]))
    assert weekly_players(value, 2027)[1] is False

def test_zero_attempts_are_not_missing_data():
    value = side()
    stats = value['rosterForMatchupPeriod']['entries'][0]['playerPoolEntry']['player']['stats'][1]['stats']
    for key in ['15', '16']:
        stats[key] = 0
        value['cumulativeScore']['scoreByStat'][key]['score'] = 0
    players, complete = weekly_players(value, 2027)
    assert complete and players[0]['stats']['FT%'] is None

def test_live_player_totals_use_live_team_score_instead_of_delayed_score():
    from worker.normalize import normalize_matchup
    value = side()
    value['teamId'] = 1
    value['cumulativeScoreLive'] = deepcopy(value['cumulativeScore'])
    value['cumulativeScoreLive'].update(wins=6, ties=0)
    value['cumulativeScoreLive']['scoreByStat'].update({'19': {'score': .5}, '20': {'score': 1}})
    value['cumulativeScore']['scoreByStat']['0']['score'] = 5
    value['cumulativeScore']['wins'] = 3
    m = {'id': 1, 'matchupPeriodId': 2, 'home': value, 'away': deepcopy(value)}
    normalized = normalize_matchup(m, 2027)
    assert normalized['home']['stats']['PTS'] == 12
    assert normalized['home']['wins'] == 6
    assert normalized['home']['performanceComplete'] is True
    # Final results remain authoritative; an incomplete live payload falls back.
    m['winner'] = 'HOME'
    assert normalize_matchup(m, 2027)['home']['stats']['PTS'] == 5
    m['winner'] = 'UNDECIDED'
    del value['cumulativeScoreLive']['scoreByStat']['1']
    assert normalize_matchup(m, 2027)['home']['stats']['PTS'] == 5
