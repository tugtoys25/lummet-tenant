export var form = document.getElementById("hhForm");

export var statusEl = document.getElementById("hhStatus");

export var saveBtn = document.getElementById("hhSave");

export var discardBtn = document.getElementById("hhDiscard");

export var resetBtn = document.getElementById("hhReset");

export var previewEl = document.getElementById("hhPreview");

export var DEFAULTS = {};

try { DEFAULTS = JSON.parse(document.getElementById("hhDefaults").textContent) || {}; } catch (e) { DEFAULTS = {}; }

export var KEYS = Object.keys(DEFAULTS);
