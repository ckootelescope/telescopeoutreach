// Paste this into the Script Editor for the Outreach Status spreadsheet
// (Extensions > Apps Script), then run addHyperlinksToOutreachStatus()
// It will hyperlink every company name in the 6/1 Name column to their website.

function addHyperlinksToOutreachStatus() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var sheet;
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === 1093124049) {
      sheet = sheets[i];
      break;
    }
  }
  if (!sheet) {
    Logger.log("Sheet with gid 1093124049 not found");
    return;
  }

  var mapping = {
    "Certo": "https://askcerto.com",
    "DesignVerse": "https://designverse.ai",
    "Kimpton": "https://kimpton.ai",
    "PayPath": "https://paypath.ai",
    "Plan0": "https://plan0.ai",
    "Prism Layer": "https://prismlayer.ai",
    "Alguna": "https://alguna.com",
    "Alpa": "https://getalpa.com",
    "Archie": "https://heyarchie.ai",
    "BalancedTrust": "https://balanced-trust.com",
    "Blue Pill": "https://blue-pill.ai",
    "Clave": "https://tryclave.ai",
    "Continuum": "https://oncontinuum.com",
    "Domu": "https://domu.ai",
    "Edwin": "https://edwingov.com",
    "Ekko": "https://ekko.earth",
    "Ferry": "https://deployferry.io",
    "Fireproof": "https://fireprooftech.com",
    "Frugal": "https://frugal.co",
    "Internet Backyard": "https://internetbackyard.com",
    "JustWin": "https://justwin.ai",
    "Kinth": "https://kinth.ai",
    "Kotini": "https://kotini.co.uk",
    "Nebula": "https://trynebula.ai",
    "Nox Metals": "https://noxmetals.co",
    "Olympian": "https://getolympian.co",
    "Onetera": "https://onetera.com",
    "Paraglide": "https://paraglide.ai",
    "PartsPulse": "https://partspulse.ai",
    "Pensar": "https://pensarai.com",
    "Petra Security": "https://petrasecurity.com",
    "Prox": "https://useprox.com",
    "Quash": "https://quash.ai",
    "Qued": "https://qued.com",
    "RamAIn": "https://ramain.ai",
    "Rama": "https://tryrama.com",
    "Reviva": "https://joinreviva.com",
    "SAMMY Labs": "https://sammylabs.com",
    "Tero": "https://usetero.com",
    "ThirdLaw": "https://thirdlaw.io",
    "Tofu": "https://hiretofu.com",
    "Trace": "https://trace.so",
    "Traza": "https://traza.ai",
    "Zalion": "https://zalion.ai",
    "Zeit": "https://zeit-ai.com",
    "ZeroDrift": "https://zerodrift.ai"
  };

  // Column F (6) = 6/1 Name column
  var col = 6;
  var lastRow = sheet.getLastRow();
  var range = sheet.getRange(2, col, lastRow - 1, 1);
  var values = range.getValues();
  var count = 0;

  for (var i = 0; i < values.length; i++) {
    var name = values[i][0].toString().trim();
    if (name && mapping[name]) {
      var cell = sheet.getRange(i + 2, col);
      var richText = SpreadsheetApp.newRichTextValue()
        .setText(name)
        .setLinkUrl(mapping[name])
        .build();
      cell.setRichTextValue(richText);
      count++;
    }
  }

  Logger.log("Hyperlinked " + count + " companies");
}
