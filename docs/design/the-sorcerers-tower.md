# The Sorcerer's Tower

Roguelite design sketch for Merlin's Revenge, saved verbatim as the initial design reference for a roguelike built on this port. Not yet being followed.

- Author: megaman4ever, 27 Nov 2024 (comment added 9 Dec 2024)
- Source: [The Metal Box suggestion #7174](https://themetalbox.com/index.php?page=suggestion&suggestion=7174&game=all&subType=all&orderby=datenew&start=0&search_term=) (tagged `mr_open | map`)
- Saved: 2026-09-27

---

Hi all, long time no see!

Last weekend I was daydreaming about playing a Merlin's Revenge roguelite. The concept seems exciting, since it could provide more of an arcade feel to MR. Generating random maps from predetermined screen structures and various "biomes" doesn't seem too difficult, and pushing one's luck in an MR2 Scoring kind of way could be a nice way to earn bonuses.

The roguelite format could also open the doors to greater spell variety - although flinging goblins with Energy Blast is always the most fun in the end.

Alas, who has the time to commit for such a grand project? Thus I had the idea of making a prototype map with Merlin Open. Simulate the feel of a randomly generated map, but with 1% of the development time - brilliant!

Although the editor still runs fine, the runtime EXE refuses to open on the latest Windows 10, regardless of compatibility settings. I'm sure there's some kind of finangling that could revive it, but unfortunately it's a bit beyond me at the moment. Last time I confirmed it worked was in 2021. Time flies.

I decided to settle on the third best thing: writing about the structure of the prototype map here in the Suggestions DB, for future reference and inspiration.

1. The map is 4x16, simulating four 4x4 "floors" of a mad wizard's tower.

2. Each floor is themed differently, with corresponding enemies and jumps in difficulty. They are, in order, Goblin Forest, Undead Marsh, Dragon Canyon, and Magic Maze.

3. The player starts from the bottom corner of a floor and has to make their way to the diagonally opposing corner, which has the only exit to the next floor.

4. In the X direction the enemies become more numerous, while in the Y direction the enemies have more settlings/summoners. Thus the opposing corner of a floor is the most difficult, representing a "boss" battle of sorts.

5. The other two corners (1,4 and 4,1 of a floor) have plentiful potion pickups - guarded by a "mid-boss" of the floor's enemy type.

6. Each floor starts by granting the player a new random spell or an assortment of allies - a handy reward for defeating the boss of the previous floor.

7. Enemy types by floor:

   - Goblin Forest - mainly goblin archers, with plenty of fighters in room 4,1 and some mages/orcs near the end of the floor.
     Boss: hydra trainer or orc camp.  
     Difficulty progression (on a scale of 10): 0 -> 3  

   - Undead Marsh - as the name suggests, there's plenty of skeletons, with a necromancer guarding room 1,4. Can add cave enemies and bats for variety.
     Boss: skeleton army or necromancy club.  
     Difficulty progression: 1 -> 5  

   - Dragon Canyon - I'm imagining martial artists, rock golems, and of course the titular dragons. More golems in the Y direction, while more dragons in the X direction.
     Boss: dark golems or dragon's lair.  
     Difficulty progression: 3 -> 6  

   - Magic Maze - MR3's new wizard enemies, some more necromancers, and the chromatic sorcerers all make their appearance! An epic climax to an exciting journey - but the powered-up Merlin is more than capable of overcoming the odds.
     Boss: The Black Sorcerer  
     Difficulty progression: 5 -> 7  

8. Each room's exits are further divided into four 9x4 tile sections, which may prevent traversal between specific directions, divide the room into two T-shapes, and so on. The point is that each room can have arbitrary structure yet connect neatly to all adjacent rooms, as the edge walls are in predictable locations. This structure allows many different layouts, even an elaborate maze if desired.

9. In addition to having unique enemy types, each floor also has a distinct wall layout. They are:

   - Goblin Forest - forest tiles are grouped into small patches, with some rooms being U-shaped thanks to longer walls that stretch into the center. Generally very open and easily navigatable though. Almost all rooms are T or + shaped, with easy access into all directions.

   - Undead Marsh - barren trees sometimes cut through the rooms, subdividing them into L and T shapes. Trickier navigation and riskier combat due to the proximity of enemies.

   - Dragon Canyon - this one is again more navigatable as a whole, but many rooms are divided by long walls into S shapes to give a sense of "climbing" while dodging golem rocks and dragonfire.

   - Magic Maze - narrower corridors, complex room layouts, and wider area attacks are the perfect ingredients for a mage's impenetrable fortress. Gives the sense that the tower's owner really doesn't want anyone barging into their private study. But what can you do when Merlin wants revenge?

That's all I have for now! I was quite excited about designing the map, but it's too bad I can't get the engine to run. At least I can share this here in case it sparks a seed of inspiration in somebody else :)
