"use strict";

// Canonical lightweight synthesized audio content. The Content Editor edits
// this game-side catalog directly; no binary audio assets are required.
const SYNTH_AUDIO_DEFINITIONS = Object.freeze({
  "musicTracks": {
    "moonlit_court": {
      "id": "moonlit_court",
      "name": "Moonlit Court",
      "bpm": 82,
      "loopBeats": 16,
      "voices": [
        {
          "wave": "triangle",
          "gain": 0.15,
          "attack": 0.01,
          "release": 0.1,
          "notes": [
            [
              "D2",
              0,
              2
            ],
            [
              "A2",
              2,
              2
            ],
            [
              "C3",
              4,
              2
            ],
            [
              "A2",
              6,
              2
            ],
            [
              "G2",
              8,
              2
            ],
            [
              "D2",
              10,
              2
            ],
            [
              "F2",
              12,
              2
            ],
            [
              "A2",
              14,
              2
            ]
          ]
        },
        {
          "wave": "square",
          "gain": 0.06,
          "attack": 0.01,
          "release": 0.08,
          "notes": [
            [
              "D4",
              0,
              0.5
            ],
            [
              "F4",
              1,
              0.5
            ],
            [
              "A4",
              2,
              1
            ],
            [
              "C4",
              4,
              0.5
            ],
            [
              "F4",
              5,
              0.5
            ],
            [
              "A4",
              6,
              1
            ],
            [
              "D4",
              8,
              0.5
            ],
            [
              "G4",
              9,
              0.5
            ],
            [
              "Bb4",
              10,
              1
            ],
            [
              "C4",
              12,
              0.5
            ],
            [
              "F4",
              13,
              0.5
            ],
            [
              "A4",
              14,
              1
            ]
          ]
        }
      ]
    },
    "camelot_twilight": {
      "id": "camelot_twilight",
      "name": "Camelot Twilight",
      "bpm": 76,
      "loopBeats": 32,
      "voices": [
        {
          "wave": "triangle",
          "gain": 0.16,
          "attack": 0.03,
          "release": 0.2,
          "notes": [
            [
              "D2",
              0,
              4
            ],
            [
              "A2",
              4,
              4
            ],
            [
              "C3",
              8,
              4
            ],
            [
              "G2",
              12,
              4
            ],
            [
              "D2",
              16,
              4
            ],
            [
              "Bb2",
              20,
              4
            ],
            [
              "C3",
              24,
              4
            ],
            [
              "A2",
              28,
              4
            ]
          ]
        },
        {
          "wave": "triangle",
          "gain": 0.09,
          "attack": 0.02,
          "release": 0.14,
          "notes": [
            [
              "D3",
              0,
              1
            ],
            [
              "A3",
              1,
              1
            ],
            [
              "F3",
              2,
              1
            ],
            [
              "A3",
              3,
              1
            ],
            [
              "C3",
              4,
              1
            ],
            [
              "G3",
              5,
              1
            ],
            [
              "E3",
              6,
              1
            ],
            [
              "G3",
              7,
              1
            ],
            [
              "Bb2",
              8,
              1
            ],
            [
              "F3",
              9,
              1
            ],
            [
              "D3",
              10,
              1
            ],
            [
              "F3",
              11,
              1
            ],
            [
              "C3",
              12,
              1
            ],
            [
              "G3",
              13,
              1
            ],
            [
              "D3",
              14,
              1
            ],
            [
              "G3",
              15,
              1
            ],
            [
              "D3",
              16,
              1
            ],
            [
              "A3",
              17,
              1
            ],
            [
              "F3",
              18,
              1
            ],
            [
              "A3",
              19,
              1
            ],
            [
              "Bb2",
              20,
              1
            ],
            [
              "F3",
              21,
              1
            ],
            [
              "D3",
              22,
              1
            ],
            [
              "F3",
              23,
              1
            ],
            [
              "C3",
              24,
              1
            ],
            [
              "G3",
              25,
              1
            ],
            [
              "E3",
              26,
              1
            ],
            [
              "G3",
              27,
              1
            ],
            [
              "A2",
              28,
              1
            ],
            [
              "E3",
              29,
              1
            ],
            [
              "C3",
              30,
              1
            ],
            [
              "E3",
              31,
              1
            ]
          ]
        },
        {
          "wave": "square",
          "gain": 0.055,
          "attack": 0.025,
          "release": 0.16,
          "notes": [
            [
              "A4",
              0,
              1
            ],
            [
              "C5",
              1,
              1
            ],
            [
              "D5",
              2,
              2
            ],
            [
              "F5",
              4,
              1
            ],
            [
              "E5",
              5,
              1
            ],
            [
              "D5",
              6,
              2
            ],
            [
              "C5",
              8,
              1
            ],
            [
              "D5",
              9,
              1
            ],
            [
              "F5",
              10,
              1
            ],
            [
              "A5",
              11,
              1
            ],
            [
              "G5",
              12,
              2
            ],
            [
              "F5",
              14,
              1
            ],
            [
              "D5",
              15,
              1
            ],
            [
              "A4",
              16,
              1
            ],
            [
              "D5",
              17,
              1
            ],
            [
              "F5",
              18,
              2
            ],
            [
              "G5",
              20,
              1
            ],
            [
              "F5",
              21,
              1
            ],
            [
              "D5",
              22,
              1
            ],
            [
              "C5",
              23,
              1
            ],
            [
              "E5",
              24,
              1
            ],
            [
              "G5",
              25,
              1
            ],
            [
              "A5",
              26,
              2
            ],
            [
              "F5",
              28,
              1
            ],
            [
              "E5",
              29,
              1
            ],
            [
              "D5",
              30,
              2
            ]
          ]
        },
        {
          "wave": "sine",
          "gain": 0.04,
          "attack": 0.08,
          "release": 0.3,
          "notes": [
            [
              "D5",
              3.5,
              0.5
            ],
            [
              "A5",
              7.5,
              0.5
            ],
            [
              "F5",
              11.5,
              0.5
            ],
            [
              "G5",
              15.5,
              0.5
            ],
            [
              "A5",
              19.5,
              0.5
            ],
            [
              "D6",
              23.5,
              0.5
            ],
            [
              "C6",
              27.5,
              0.5
            ],
            [
              "A5",
              31.5,
              0.5
            ]
          ]
        }
      ]
    }
  },
  "sfx": {
    "pickup_confirm": {
      "id": "pickup_confirm",
      "name": "Pickup Confirm",
      "duration": 0.18,
      "layers": [
        {
          "wave": "square",
          "startHz": 520,
          "endHz": 760,
          "gain": 0.12,
          "attack": 0.005,
          "release": 0.08
        },
        {
          "wave": "triangle",
          "startHz": 1040,
          "endHz": 1320,
          "gain": 0.05,
          "start": 0.045,
          "duration": 0.135,
          "attack": 0.005,
          "release": 0.06
        }
      ]
    }
  }
});
