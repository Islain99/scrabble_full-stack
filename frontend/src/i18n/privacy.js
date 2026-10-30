// src/i18n/privacy.js
//
// Politique de confidentialité (lot 7 — Loi 25, Québec), en français et en anglais.
// Texte long : gardé hors de translations.js. À relire et à adapter si l'application
// change (nouvelles données, nouveaux prestataires).
//
// Adresse de contact du responsable : variable VITE_PRIVACY_CONTACT (Vercel).

export const PRIVACY_UPDATED = '2026-10-29';
export const PRIVACY_CONTACT = import.meta.env.VITE_PRIVACY_CONTACT || '';

export const privacy = {
  fr: {
    title: 'Politique de confidentialité',
    updated: 'Dernière mise à jour : 29 octobre 2026',
    intro: "Cette page explique quels renseignements personnels l'application Scrabble recueille, pourquoi, "
      + "où ils sont conservés, qui peut les lire et comment vous pouvez les consulter, les télécharger ou les "
      + "supprimer. Elle suit la Loi sur la protection des renseignements personnels dans le secteur privé du "
      + 'Québec (Loi 25).',
    contactLabel: 'Responsable de la protection des renseignements personnels',
    contactFallback: "Le développeur de l'application. Écrivez-lui depuis la messagerie du jeu ou à l'adresse publiée sur la page du projet.",
    sections: [
      {
        title: 'Ce que nous recueillons',
        items: [
          "Compte : adresse e-mail, pseudo, mode de connexion (e-mail ou Google). Le mot de passe est géré par Firebase Authentication (Google) : nous ne le voyons jamais.",
          'Profil, si vous le remplissez : prénom, nom, âge, pays, présentation, photo.',
          'Jeu : parties jouées, scores, statistiques, cote multijoueur, historique, préférences (difficulté, affichage, notifications).',
          "Vie sociale : code ami, amis, demandes, groupes d'amis, joueurs bloqués, invitations, présence en ligne (« en ligne », « en partie », « vu il y a… »), visible de vos seuls amis.",
          'Messagerie : messages privés, de groupe, du salon universel et des parties, signalements que vous faites.',
          "Notifications push, si vous les activez : un identifiant technique de l'appareil (jeton Firebase Cloud Messaging) et sa langue.",
          "Sur votre appareil : réglages, langue, thème et partie solo en cours sont gardés dans le stockage du navigateur. Aucun cookie publicitaire, aucun pistage, aucune publicité.",
        ],
      },
      {
        title: 'Pourquoi',
        items: [
          'Faire fonctionner le jeu : vous connecter, enregistrer vos parties, établir les classements.',
          "Les fonctions sociales : amis, invitations, présence, messagerie, notifications.",
          'La sécurité et la modération : limites anti-harcèlement, filtre de mots et de liens, traitement des signalements.',
          "Nous ne vendons ni ne louons vos renseignements, et nous ne les utilisons pas à des fins publicitaires.",
        ],
      },
      {
        title: 'Messagerie : ce qu\'il faut savoir',
        warning: true,
        items: [
          "Les messages ne sont pas chiffrés de bout en bout. Ils sont chiffrés pendant leur transport (HTTPS), puis enregistrés sur nos serveurs, où le serveur peut les lire.",
          'Le serveur lit chaque message avant de le publier, pour masquer les mots interdits et bloquer les liens des comptes récents.',
          "Un administrateur lit les messages signalés par les joueurs. Il peut les supprimer et rendre un joueur muet pour un temps.",
          "Les messages du salon universel sont visibles de tous les joueurs connectés et sont effacés au bout de 30 jours.",
          "N'écrivez pas d'informations sensibles (mots de passe, coordonnées bancaires, renseignements de santé) dans la messagerie.",
        ],
      },
      {
        title: 'Qui peut voir quoi',
        items: [
          'Tout le monde : votre pseudo, votre photo, votre présentation, votre pays, votre code ami, vos statistiques et votre rang dans les classements.',
          'Vos amis : votre présence en ligne.',
          'Les membres d\'une conversation : ses messages. L\'administrateur : les messages signalés.',
          'Votre adresse e-mail, vos nom, prénom et âge ne sont jamais montrés aux autres joueurs.',
        ],
      },
      {
        title: 'Où sont vos renseignements (prestataires)',
        paragraphs: [
          'Nous faisons appel à des prestataires, qui peuvent conserver les données hors du Québec et du Canada, notamment aux États-Unis :',
        ],
        items: [
          'Google Firebase : connexion (Authentication), affichage en direct (Realtime Database), notifications push (Cloud Messaging).',
          'Railway : serveur de l\'application et base de données PostgreSQL.',
          'Vercel : hébergement du site web.',
        ],
      },
      {
        title: 'Durée de conservation',
        items: [
          'Votre compte et ce qui s\'y rattache : jusqu\'à ce que vous le supprimiez.',
          'Salon universel : 30 jours. Parties multijoueur terminées : 30 jours (votre historique, lui, reste dans votre profil).',
          'Parties solo : 1 jour après la fin, 14 jours sans activité.',
          'Jetons de notification : supprimés à la déconnexion, quand vous coupez les notifications ou quand l\'appareil ne les accepte plus.',
        ],
      },
      {
        title: 'Vos droits',
        items: [
          'Consulter et télécharger vos données : Paramètres → Compte et confidentialité → Télécharger mes données (fichier JSON).',
          'Les corriger : depuis votre profil.',
          "Retirer votre consentement aux notifications : Paramètres → Notifications, ou dans les réglages de l'appareil.",
          'Supprimer votre compte : Paramètres → Compte et confidentialité → Supprimer mon compte. La suppression est définitive et immédiate (voir ci-dessous).',
          "Porter plainte auprès de la Commission d'accès à l'information du Québec si vous estimez que vos droits ne sont pas respectés.",
        ],
      },
      {
        title: 'Suppression du compte',
        items: [
          'Profil, statistiques, historique, amis, groupes, blocages, invitations, préférences et appareils inscrits sont supprimés.',
          'Vos messages sont supprimés, y compris dans le salon universel. Vos conversations privées disparaissent aussi pour votre correspondant ; un groupe que vous aviez créé revient à son plus ancien membre.',
          "Une partie en cours compte comme un abandon : votre adversaire gagne. Ses statistiques et son historique, qui lui appartiennent, sont conservés.",
          'Votre compte Firebase est supprimé : la même adresse e-mail pourra servir à créer un nouveau compte.',
        ],
      },
      {
        title: 'Enfants',
        paragraphs: [
          "Si vous avez moins de 14 ans, un parent ou tuteur doit accepter la création du compte. Le salon universel est public : nous recommandons aux parents d'en parler avec leur enfant.",
        ],
      },
      {
        title: 'Sécurité',
        paragraphs: [
          "Les échanges passent par HTTPS. L'accès à la base de données est réservé au serveur. Les règles Firebase limitent chaque joueur à ses propres données (partie, notifications, conversations dont il est membre). En cas d'incident de confidentialité présentant un risque sérieux, les personnes concernées et la Commission d'accès à l'information seront avisées.",
        ],
      },
    ],
  },

  en: {
    title: 'Privacy policy',
    updated: 'Last updated: October 29, 2026',
    intro: 'This page explains what personal information the Scrabble app collects, why, where it is stored, '
      + 'who can read it, and how you can view, download or delete it. It follows Québec\'s Act respecting the '
      + 'protection of personal information in the private sector (Law 25).',
    contactLabel: 'Person in charge of the protection of personal information',
    contactFallback: "The app's developer. Reach them through the in-game messaging or at the address published on the project page.",
    sections: [
      {
        title: 'What we collect',
        items: [
          'Account: email address, username, sign-in method (email or Google). Your password is handled by Firebase Authentication (Google): we never see it.',
          'Profile, if you fill it in: first name, last name, age, country, bio, photo.',
          'Gameplay: games played, scores, statistics, multiplayer rating, history, preferences (difficulty, display, notifications).',
          'Social: friend code, friends, requests, friend groups, blocked players, invitations, online presence ("online", "in a game", "seen … ago"), visible to your friends only.',
          'Messaging: private, group, global-lounge and in-game messages, and the reports you make.',
          'Push notifications, if you turn them on: a technical device identifier (Firebase Cloud Messaging token) and its language.',
          'On your device: settings, language, theme and your current solo game are kept in browser storage. No advertising cookies, no tracking, no ads.',
        ],
      },
      {
        title: 'Why',
        items: [
          'To run the game: sign you in, save your games, build the leaderboards.',
          'Social features: friends, invitations, presence, messaging, notifications.',
          'Safety and moderation: anti-harassment limits, word and link filter, handling reports.',
          'We do not sell or rent your information, and we do not use it for advertising.',
        ],
      },
      {
        title: 'Messaging: what you should know',
        warning: true,
        items: [
          'Messages are not end-to-end encrypted. They are encrypted in transit (HTTPS), then stored on our servers, where the server can read them.',
          'The server reads every message before publishing it, to mask banned words and block links from new accounts.',
          'An administrator reads messages reported by players. They can delete them and mute a player for a while.',
          'Messages in the global lounge are visible to every signed-in player and are erased after 30 days.',
          'Do not write sensitive information (passwords, banking details, health information) in the messaging.',
        ],
      },
      {
        title: 'Who can see what',
        items: [
          'Everyone: your username, photo, bio, country, friend code, statistics and leaderboard rank.',
          'Your friends: your online presence.',
          'Members of a conversation: its messages. The administrator: reported messages.',
          'Your email address, name and age are never shown to other players.',
        ],
      },
      {
        title: 'Where your information is kept (service providers)',
        paragraphs: [
          'We rely on service providers that may store data outside Québec and Canada, notably in the United States:',
        ],
        items: [
          'Google Firebase: sign-in (Authentication), live updates (Realtime Database), push notifications (Cloud Messaging).',
          'Railway: application server and PostgreSQL database.',
          'Vercel: website hosting.',
        ],
      },
      {
        title: 'How long we keep it',
        items: [
          'Your account and everything tied to it: until you delete it.',
          'Global lounge: 30 days. Finished multiplayer games: 30 days (your history stays in your profile).',
          'Solo games: 1 day after they end, 14 days without activity.',
          'Notification tokens: removed when you sign out, turn notifications off, or the device stops accepting them.',
        ],
      },
      {
        title: 'Your rights',
        items: [
          'View and download your data: Settings → Account & privacy → Download my data (JSON file).',
          'Correct it: from your profile.',
          'Withdraw consent to notifications: Settings → Notifications, or in your device settings.',
          'Delete your account: Settings → Account & privacy → Delete my account. Deletion is permanent and immediate (see below).',
          "File a complaint with Québec's Commission d'accès à l'information if you believe your rights are not respected.",
        ],
      },
      {
        title: 'Account deletion',
        items: [
          'Profile, statistics, history, friends, groups, blocks, invitations, preferences and registered devices are deleted.',
          'Your messages are deleted, including in the global lounge. Your private conversations also disappear for the other person; a group you created passes to its longest-standing member.',
          'A game in progress counts as a resignation: your opponent wins. Their statistics and history, which belong to them, are kept.',
          'Your Firebase account is deleted: the same email address can be used to create a new account.',
        ],
      },
      {
        title: 'Children',
        paragraphs: [
          "If you are under 14, a parent or guardian must agree to the account being created. The global lounge is public: we encourage parents to talk about it with their child.",
        ],
      },
      {
        title: 'Security',
        paragraphs: [
          'Traffic goes through HTTPS. Only the server can access the database. Firebase rules limit each player to their own data (game, notifications, conversations they belong to). If a confidentiality incident presents a risk of serious harm, the people concerned and the Commission d\'accès à l\'information will be notified.',
        ],
      },
    ],
  },
};
