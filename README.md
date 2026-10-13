# Descente en Averne — table virtuelle (Raggadragga)

VTT temps réel vue du dessus, sans dépendance (Node 18+).

    node server.js          # port 3000 (PORT=8080 pour changer)

- Joueurs : `http://<ip>:3000` (chacun choisit son personnage)
- MJ : lien avec clé affiché au démarrage (`/?gm=CLE`, clé dans `data/gm.key`)
- Tests du moteur : `npm test`

Les règles de conduite des machines infernales sont des règles maison marquées « provisoire » (onglet Règles). Les valeurs à ajuster sont dans `server/encounter.js`.
Carte personnalisée : onglet MJ → Carte → importer une image.
Jeu à distance : exposez le port via un tunnel (Tailscale, Cloudflare Tunnel, ngrok).
