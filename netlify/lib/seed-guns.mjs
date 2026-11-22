// First load of the gun ledger (Oct 2026 master list). Values are list/original prices; no tax, stamps, FFL fees,
// ammo, mags or labor. The first item on each firearm is the gun itself; the rest are its mods.
const g = (name, items, notes = "") => ({ group: "firearm", name, notes, items: items.map(([n, p]) => ({ name: n, price: p })) });

export const GUNS = [
  g("S&W 1854 .30-30", [["S&W 1854 rifle", 1499], ["Ranger Point Precision ModStock", 299], ["Ranger Point 13.25\" PewView M-LOK handguard", 281], ["Ranger Point M-LOK 6-round quiver", 59], ["Vortex 3-9x40 scope", 250], ["Vortex cantilever mount", 120], ["Rugged Alaskan360 suppressor", 1112]], "Vortex scope/mount came from the Stag AR."),
  g("KRISS Vector Gen 3 9mm", [["KRISS Vector Gen 3", 1500], ["Rugged Obsidian 9 suppressor", 799], ["Rugged 3-Lug Mount", 139], ["Rugged 3-Lug Adapter", 99], ["SureFire Scout Light Pro", 369], ["Unity ModButton", 124], ["Z-Bolt tailcap", 89], ["A3 Tactical vertical grip", 75], ["A3 Tactical folding 1913 stock", 299], ["A3 Tactical cheek riser", 45], ["Holosun AEMS Pro", 470], ["Unity FAST AEMS Mount", 175], ["Unity FAST Offset Base", 95], ["Unity Offset Plate", 45], ["InfiTac FMP13", 690]]),
  g("FN 509 Tactical", [["FN 509 Tactical", 1229], ["Trijicon SRO 2.5 MOA", 579], ["Springer Precision billet base plate", 19.5]]),
  g("CZ Scorpion 3+", [["CZ Scorpion 3+", 999], ["Rugged RX muzzle brake", 280], ["Rugged RX 1/2x28 adapter", 99], ["Holosun HS510C", 340], ["Reptilia LINK folding stock", 250], ["Streamlight ProTac Rail Mount 2", 145]]),
  g("S&W 686-6 Plus Deluxe", [["S&W 686-6 Plus Deluxe", 821]]),
  g("Springfield Hellcat Pro", [["Springfield Hellcat Pro", 649], ["Holosun EPS Carry", 430], ["Streamlight TLR-7 Sub", 160], ["True Precision threaded barrel", 190], ["Hogue grip", 15]]),
  g("HK 416 .22 LR", [["HK 416 .22 LR", 505], ["Holosun EVO + HM3X combo", 429.99]]),
  g("Kimber Micro 9 Rapide", [["Kimber Micro 9 Rapide", 985]]),
  g("Stag AR .300 Blackout build", [["Stag Arms lower", 299], ["ODIN Works 10.5\" .300 BLK stainless barrel, tunable gas block (B-300-10-P-TG)", 270], ["Faxon M16 BCG Nitride/TiN PVD (FF556BCGCNITRIDE-TiN)", 184], ["Radian charging handle", 125], ["STNGR HWK XL 13.5\" handguard", 189.99], ["AIM Sports flared magwell + trigger guard (ARFMWA)", 65], ["Rare Breed FRT", 450], ["Maxim Defense CQB Gen 7 stock (MXM-47627)", 360], ["EOTech HHS II EXPS2-2 + G33", 1299], ["Cloud Defensive REIN", 369.99], ["A3 Industries Xeno Triad grip", 18.95], ["One Horse RYN .30 titanium suppressor (OH-RYN30)", 599.99]], "Shield offset optic is NOT on this build."),
  g("Mossberg Maverick 88", [["Mossberg Maverick 88", 259], ["Hogue pistol grip", 30]]),
  g("Mossberg 590 Shockwave", [["Mossberg 590 Shockwave", 569]]),
  g("Tippmann M4-22 Elite FRT", [["Tippmann M4-22 Elite FRT", 1579], ["EOTech 512", 529], ["DFCO Kung Fu Grip", 20]], "Oculus22 moved to the Ruger Charger."),
  g("Glock 19 Gen 3", [["Glock 19 Gen 3", 499], ["Zaffiri Precision slide", 349], ["Zaffiri threaded barrel", 179], ["Trijicon SRO", 579], ["Reptilia BLACKHOLE magwell", 23.95], ["Timney Alpha Competition trigger", 149.99]]),
  g("Ruger 22 Charger", [["Ruger 22 Charger", 389], ["Mars Trigger 10/22 adjustable FRT (A005-ASM-001-V01)", 289.85], ["Rugged Oculus22 suppressor", 515], ["A3 Industries folding stock", 255.08], ["A3 Industries Xeno Triad grip", 18.95], ["Strike Industries Modular Rifle Chassis", 309.99], ["Ballistic Advantage Premium Fluted Barrel", 185.25], ["Volquartsen Firefly Bolt 2.0", 179.99], ["Holosun SCRS", 229.99]]),
  g("SIG P211 GTO Combat", [["SIG P211 GTO Combat", 2499.99], ["Trijicon SRO 2.5 MOA Coyote Brown (SRO2-C-2500020)", 867]], "SRO direct-mounted via SIG-LOC Pro, no plate."),
  g("Beretta 21A Bobcat Kale Slushy .22 LR", [["Beretta 21A Bobcat Kale Slushy", 649]], "Paid $500; valued at $649 list."),
  g("Daniel Defense PCC 9mm", [["Daniel Defense PCC", 1949], ["EOTech EXPS3", 450], ["Rare Breed FRT", 450]], "EOTech EXPS3 at actual purchase price."),
  { group: "gear", name: "SilencerCo Osprey 9 2.0 (unassigned)", notes: "AC25 is the correct piston for standard 1/2x28 9mm barrels. A Rugged Obsidian piston is NOT interchangeable.", items: [{ name: "SilencerCo Osprey 9 2.0", price: 694 }, { name: "SilencerCo AC25 1/2x28 piston", price: 89 }] },
  { group: "spare", name: "Spare Stag Arms 16\" AR-15 upper", notes: "Not attached to any lower; separate from the .300 BLK build.", items: [{ name: "Complete Stag Arms 16\" upper", price: 700 }, { name: "Shield offset reflex optic", price: 300 }] },
];
