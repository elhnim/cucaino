// Discovery facts for the Midnight Rift: one card per creature and place (real, fun, for 8-12 year
// olds). Pure data. `extinct` ones are animals that only live on as fossils (and here, in the park).

export interface AbyssFact {
  id: string;
  name: string;
  text: string;
  extinct?: boolean;
}

export const RIFT_FACT: AbyssFact = {
  id: "midnight-rift",
  name: "The Midnight Rift",
  text: "A deep crack in the sea floor! Sunlight never reaches the bottom of the real 'midnight zone', so most animals down there make their own light. The deepest place on Earth, the Mariana Trench, is almost 11 km deep, deeper than Mount Everest is tall.",
};

export const FACTS = {
  megalodon: {
    id: "megalodon",
    name: "Megalodon",
    extinct: true,
    text: "The biggest shark that ever lived: up to about 18 m long, as long as a bus and a half! Its teeth were as big as your hand. Megalodons died out about 3.6 million years ago. This one just wants to say hello.",
  },
  giantOctopus: {
    id: "giant-octopus",
    name: "Ancient Giant Octopus",
    extinct: true,
    text: "Fossil jaws show that giant octopuses swam in the seas 100 million years ago, when dinosaurs walked the land, and some may have been longer than a bus! Octopuses have three hearts, blue blood, and can change colour in a blink.",
  },
  liopleurodon: {
    id: "liopleurodon",
    name: "Liopleurodon",
    extinct: true,
    text: "A sea reptile from the time of the dinosaurs, about 160 million years ago. It 'flew' through the water with four big flippers and could smell its food underwater through its nostrils.",
  },
  dunkleosteus: {
    id: "dunkleosteus",
    name: "Dunkleosteus",
    extinct: true,
    text: "An armoured fish from 360 million years ago with a bony helmet. It had no teeth: its jaws were sharp bony blades that sharpened themselves as they rubbed together, and it had one of the fastest bites ever.",
  },
  helicoprion: {
    id: "helicoprion",
    name: "Helicoprion",
    extinct: true,
    text: "It lived 290 million years ago and had a spiral of teeth in its lower jaw, like a buzz saw! For a hundred years scientists argued about where the spiral went. It was a cousin of today's ratfish, not a true shark.",
  },
  ammonite: {
    id: "ammonite",
    name: "Ammonite",
    extinct: true,
    text: "Relatives of octopuses and squid with coiled shells. They floated by filling their shell's chambers with gas, and jetted along backwards. They lived for over 300 million years and died out with the dinosaurs.",
  },
  trilobite: {
    id: "trilobite",
    name: "Trilobite",
    extinct: true,
    text: "One of the first animals with eyes, and their eyes had lenses made of crystal! Trilobites crawled the sea floor for about 270 million years, and some could roll up into a ball like a pill bug.",
  },
  eurypterid: {
    id: "sea-scorpion",
    name: "Sea Scorpion",
    extinct: true,
    text: "Eurypterids, or sea scorpions, lived over 400 million years ago. The biggest was about 2.5 m long: the largest bug-like animal (arthropod) that has ever lived! It swam with paddle-shaped legs.",
  },
  anglerfish: {
    id: "anglerfish",
    name: "Anglerfish",
    text: "It goes fishing with its own glowing lure! The light is made by tiny bacteria living in the lure. Small fish swim up to the light... and the anglerfish gulps them down.",
  },
  giantSquid: {
    id: "giant-squid",
    name: "Giant Squid",
    text: "Up to 12 m long with its tentacles, and it has the biggest eyes of any animal: as big as dinner plates! Nobody filmed a live one in the deep sea until 2012.",
  },
  vampireSquid: {
    id: "vampire-squid",
    name: "Vampire Squid",
    text: "Not a vampire at all! It eats 'marine snow', the flakes of food drifting down. When it is scared it flips its webbed cloak inside out and puffs out a cloud of glowing blue sparkles.",
  },
  dumbo: {
    id: "dumbo-octopus",
    name: "Dumbo Octopus",
    text: "Named after Dumbo the flying elephant, because it flaps its ear-like fins to swim. It lives deeper than any other octopus, down to about 7 km!",
  },
  gulper: {
    id: "gulper-eel",
    name: "Gulper Eel",
    text: "Its mouth is bigger than its whole body, like a pelican's pouch, so it can swallow food bigger than itself. The tip of its long whippy tail glows pink.",
  },
  oarfish: {
    id: "oarfish",
    name: "Oarfish",
    text: "The longest bony fish in the world, as long as 8 m or more: a silver ribbon with a red crest. It often swims straight up and down, and old stories of 'sea serpents' may have been oarfish.",
  },
  coelacanth: {
    id: "coelacanth",
    name: "Coelacanth",
    text: "A 'living fossil'! Scientists thought it died out with the dinosaurs, until a fisherman caught one in South Africa in 1938. Its fleshy fins move like legs, and it can live to be 100.",
  },
  goblinShark: {
    id: "goblin-shark",
    name: "Goblin Shark",
    text: "It is pink because you can see its blood vessels through its skin. When it bites, its whole jaw shoots out of its mouth like a slingshot, then snaps back!",
  },
  frilledShark: {
    id: "frilled-shark",
    name: "Frilled Shark",
    text: "It looks like an eel, has six frilly gills and about 300 tiny teeth. Its family is about 80 million years old, and a mum carries her babies for up to three and a half years.",
  },
  barreleye: {
    id: "barreleye",
    name: "Barreleye",
    text: "It has a see-through head! Its glowing green tube eyes look up through its clear head to spot the shadows of food swimming above.",
  },
  combJelly: {
    id: "comb-jelly",
    name: "Comb Jelly",
    text: "Those rainbows are not lights: rows of tiny beating hairs, called combs, break the light into colours as it swims. Comb jellies are one of the oldest kinds of animal on Earth.",
  },
  siphonophore: {
    id: "siphonophore",
    name: "Siphonophore",
    text: "It looks like one long animal but it is a whole team of tiny animals joined in a chain, each with its own job. One was found that was longer than a blue whale!",
  },
  seaPig: {
    id: "sea-pig",
    name: "Sea Pig",
    text: "A sea cucumber that walks on the deep sea floor on little tube-feet legs, munching mud for food. Sea pigs wander about in herds, sometimes hundreds together.",
  },
  isopod: {
    id: "giant-isopod",
    name: "Giant Isopod",
    text: "A cousin of the little pill bugs in your garden, but as big as a cat! Giant isopods can go for years without eating, waiting for food to sink down to them.",
  },
  greenland: {
    id: "greenland-shark",
    name: "Greenland Shark",
    text: "Maybe the longest-living animal with a backbone: some are thought to be around 400 years old! It swims very, very slowly, slower than you walk.",
  },
  yetiCrab: {
    id: "yeti-crab",
    name: "Yeti Crab",
    text: "Its arms are covered in fuzzy 'hair' where it grows bacteria to eat. Yeti crabs wave their arms in the warm water over the vents to help their bacteria garden grow.",
  },
  vents: {
    id: "black-smokers",
    name: "Black Smokers",
    text: "Hydrothermal vents: chimneys that gush water hotter than 350 °C! It doesn't boil because of the huge pressure. Minerals in the water make the black 'smoke' and build the chimneys up.",
  },
  tubeWorms: {
    id: "tube-worms",
    name: "Giant Tube Worms",
    text: "They grow taller than a grown-up and have no mouth or tummy! Bacteria living inside them turn the vents' chemicals into food. Their plumes are red because they are full of blood.",
  },
  whaleFall: {
    id: "whale-fall",
    name: "Whale Fall",
    text: "When a whale dies and sinks, it becomes a feast for deep-sea life for 50 years or more. 'Zombie worms' even eat the bones!",
  },
  seaPens: {
    id: "sea-pens",
    name: "Sea Pens",
    text: "Soft corals that look like old-fashioned feather quill pens. Touch one and it glows green! They can pull themselves down into the mud to hide.",
  },
  glassSponges: {
    id: "glass-sponges",
    name: "Glass Sponges",
    text: "Their skeletons are made of glass! Some may be over 10,000 years old. A pair of little shrimp often move into a young Venus's flower basket sponge and stay for life.",
  },
  arch: {
    id: "old-arch",
    name: "The Old Arch",
    text: "Nobody knows who carved this arch or how it got down here. The glowing shells on its stones are a mystery... and the giant octopus seems to like living under it.",
  },
  bridge: {
    id: "rock-bridge",
    name: "The Rock Bridge",
    text: "A natural arch of stone right across the rift, carved out slowly by deep-sea currents over thousands and thousands of years.",
  },
} satisfies Record<string, AbyssFact>;
