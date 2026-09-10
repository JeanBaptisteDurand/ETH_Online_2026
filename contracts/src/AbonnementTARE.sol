// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

/**
 * ABONNEMENT TARE — le contrat que l'API interroge avant d'ouvrir le service.
 *
 * Il expose UNE fonction de lecture, volontairement :
 *
 *     abonneJusquA(address) -> uint256      horodatage Unix, 0 si jamais abonne
 *
 * C'est le seul endroit du projet ou un zero signifie quelque chose. Il le signifie parce
 * qu'il vient d'un `mapping` Solidity, dont le zero est la valeur d'absence definie par le
 * langage — pas d'une lecture qui a echoue. Cote serveur, apps/api/src/compte/abonnement.ts
 * tient les deux cas separes : un `eth_call` qui n'aboutit pas rend `null` et une raison,
 * jamais 0. La distinction est exactement celle que le corpus fait entre NON_MESURABLE et
 * 0,00 bps.
 *
 * TROIS DECISIONS, et chacune evite de prendre de l'argent pour rien.
 *
 * 1. PRO RATA, PAS DE RESTE. Payer 1,5 fois le prix donne 1,5 fois la duree. Un contrat qui
 *    exigerait un multiple exact refuserait des paiements valides ; un contrat qui garderait
 *    le reste prendrait de l'argent sans rien rendre. Le calcul est fait en secondes, et il
 *    est verifie par un test qui compare au wei.
 *
 * 2. ON PROLONGE, ON NE REMET PAS A ZERO. Se reabonner avant l'echeance ajoute a ce qui
 *    reste. Repartir de `block.timestamp` ferait perdre le temps deja paye — c'est la faute
 *    la plus courante de ce genre de contrat, et elle est silencieuse.
 *
 * 3. LE PLAFOND REFUSE, IL NE TRONQUE PAS. Au-dela de dix ans d'un coup, la transaction
 *    revert avec le montant maximum acceptable. Un plafond qui rognerait l'exces
 *    encaisserait la difference sans la rendre.
 *
 * Ce contrat ne detient pas de jeton, ne delegue rien, n'a pas de proxy et n'appelle aucun
 * contrat exterieur. La seule sortie de fonds est `retirer()`, reservee au proprietaire, en
 * dernier apres toute ecriture d'etat.
 */
contract AbonnementTARE {
    /* --------------------------------------------------------------- etat */

    /// Le proprietaire : il fixe le prix et retire les fonds. Rien d'autre.
    address public proprietaire;

    /// Le prix d'UNE periode, en wei.
    uint256 public prix;

    /// La duree d'une periode, en secondes.
    uint256 public duree;

    /// Au-dela, `abonner` revert plutot que de tronquer.
    uint256 public constant DUREE_MAX = 3650 days;

    /// L'echeance de chaque abonne. 0 = jamais abonne, et c'est une absence declaree.
    mapping(address => uint256) private echeance;

    /* ------------------------------------------------------------ journal */

    event Abonne(address indexed compte, address indexed payeur, uint256 montant, uint256 jusquA);
    event PrixChange(uint256 ancienPrix, uint256 nouveauPrix, uint256 ancienneDuree, uint256 nouvelleDuree);
    event Retire(address indexed vers, uint256 montant);
    event ProprietaireChange(address indexed ancien, address indexed nouveau);

    /* -------------------------------------------------------------- refus */

    error PasProprietaire(address appelant);
    error MontantInsuffisant(uint256 recu, uint256 minimum);
    error AuDelaDuPlafond(uint256 demande, uint256 maximumAcceptable);
    error PrixNul();
    error DureeNulle();
    error AdresseNulle();
    error RienARetirer();
    error EchecDuVirement();

    modifier seulProprietaire() {
        if (msg.sender != proprietaire) revert PasProprietaire(msg.sender);
        _;
    }

    constructor(uint256 prix_, uint256 duree_) {
        if (prix_ == 0) revert PrixNul();
        if (duree_ == 0) revert DureeNulle();
        proprietaire = msg.sender;
        prix = prix_;
        duree = duree_;
        emit ProprietaireChange(address(0), msg.sender);
        emit PrixChange(0, prix_, 0, duree_);
    }

    /* ------------------------------------------------------------ lecture */

    /**
     * L'unique fonction que l'API appelle. Elle rend l'echeance brute, PAS un booleen.
     *
     * Rendre `estAbonne(address) -> bool` ferait dependre la reponse de l'horloge du noeud
     * interroge, et le serveur ne pourrait ni afficher la date, ni dire de combien
     * l'abonnement est perime. C'est le serveur qui compare a l'heure, et qui l'affiche.
     */
    function abonneJusquA(address compte) external view returns (uint256) {
        return echeance[compte];
    }

    /// Rendu pour l'ecran : combien coute la duree demandee, en wei.
    function coutPour(uint256 secondes) external view returns (uint256) {
        return (secondes * prix) / duree;
    }

    /* ---------------------------------------------------------- ecriture */

    /// S'abonner pour soi.
    function abonner() external payable {
        _abonner(msg.sender);
    }

    /**
     * S'abonner POUR quelqu'un d'autre. Utile pour un relais qui paie a la place de
     * l'utilisateur, et pour la demo : le compte credite n'est pas forcement le payeur.
     */
    function abonnerPour(address compte) external payable {
        if (compte == address(0)) revert AdresseNulle();
        _abonner(compte);
    }

    /// Recevoir de l'ETH sans appel nomme vaut un abonnement pour l'expediteur.
    receive() external payable {
        _abonner(msg.sender);
    }

    function _abonner(address compte) private {
        uint256 p = prix;
        uint256 d = duree;
        if (msg.value < p) revert MontantInsuffisant(msg.value, p);

        // Pro rata, en secondes. La division tronque : l'utilisateur perd au pire une
        // seconde, jamais une periode.
        uint256 gagne = (msg.value * d) / p;

        // On prolonge ce qui reste. `depart` vaut l'echeance en cours quand elle est encore
        // devant nous, l'heure du bloc sinon — jamais l'heure du bloc quand du temps paye
        // reste, ce qui l'effacerait.
        uint256 actuelle = echeance[compte];
        uint256 depart = actuelle > block.timestamp ? actuelle : block.timestamp;
        uint256 nouvelle = depart + gagne;

        // Le plafond refuse, il ne tronque pas : tronquer encaisserait la difference.
        uint256 plafond = block.timestamp + DUREE_MAX;
        if (nouvelle > plafond) {
            uint256 restant = plafond > depart ? plafond - depart : 0;
            revert AuDelaDuPlafond(msg.value, (restant * p) / d);
        }

        echeance[compte] = nouvelle;
        emit Abonne(compte, msg.sender, msg.value, nouvelle);
    }

    /* ------------------------------------------------------ administration */

    function changerPrix(uint256 prix_, uint256 duree_) external seulProprietaire {
        if (prix_ == 0) revert PrixNul();
        if (duree_ == 0) revert DureeNulle();
        emit PrixChange(prix, prix_, duree, duree_);
        prix = prix_;
        duree = duree_;
    }

    function changerProprietaire(address nouveau) external seulProprietaire {
        if (nouveau == address(0)) revert AdresseNulle();
        emit ProprietaireChange(proprietaire, nouveau);
        proprietaire = nouveau;
    }

    /**
     * Retirer les fonds. Etat d'abord — ici il n'y en a pas a changer — appel externe en
     * dernier, et le solde est lu puis remis a zero avant le virement.
     */
    function retirer(address payable vers) external seulProprietaire {
        if (vers == address(0)) revert AdresseNulle();
        uint256 montant = address(this).balance;
        if (montant == 0) revert RienARetirer();
        emit Retire(vers, montant);
        (bool ok, ) = vers.call{value: montant}("");
        if (!ok) revert EchecDuVirement();
    }
}
