from hardware.bridge import parse


def test_parses_nano_and_esp32_lines():
    assert parse("HR,72\r\n", "nano-1") == {"device_id": "nano-1", "hr_bpm": 72}
    assert parse("HR,0", "nano-1") == {"device_id": "nano-1", "event": "ping"}
    assert parse('{"device_id":"esp32-1","event":"help"}', "nano-1") == {"device_id": "esp32-1", "event": "help"}
    assert parse('{"wifi":"connected"}', "nano-1") is None
    assert parse("RAW,512.3", "nano-1") is None
    assert parse("HR,abc", "nano-1") is None
