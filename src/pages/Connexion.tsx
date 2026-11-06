import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { estConfigure } from '../lib/appwrite';
import { APP_VERSION } from '../config/constants';
import './Connexion.css';
import { LogoApp } from '../components/LogoApp';
import { Signature } from '../components/AppShell';
import { definirNomAppareilLocal, nomAppareilLocal } from '../lib/journal';

export function Connexion() {
  const { utilisateur, connexion } = useAuth();
  const emplacement = useLocation();

  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [nomAppareil, setNomAppareil] = useState(nomAppareilLocal);

  if (utilisateur) {
    const destination = (emplacement.state as { origine?: string } | null)?.origine ?? '/';
    return <Navigate to={destination} replace />;
  }

  async function soumettre(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      definirNomAppareilLocal(nomAppareil);
      await connexion(identifiant, motDePasse);
    } catch (probleme) {
      setErreur(probleme instanceof Error ? probleme.message : 'La connexion a echoue.');
      setEnCours(false);
    }
  }

  return (
    <div className="connexion">
      <section className="connexion__panneau" aria-labelledby="connexion-titre">
        <div className="connexion__marque">
          <LogoApp taille={48} />
          <span className="connexion__marque-texte">
            <span className="connexion__marque-nom">Affiches EM</span>
            <span className="connexion__marque-lieu">Marjane Kénitra 2 · v{APP_VERSION}</span>
          </span>
        </div>

        <div className="connexion__accroche-bloc">
          <h1 id="connexion-titre" className="connexion__titre">
            Le poste de pilotage des affiches prix.
          </h1>
          <p className="connexion__accroche">
            Catalogue, campagnes et impression réunis au même endroit pour les rayons 50, 51
            et 54.
          </p>
        </div>

        <Signature variante="connexion" />
      </section>

      <section className="connexion__zone" aria-label="Connexion">
        <form onSubmit={soumettre} className="connexion__formulaire" noValidate>
          <div>
            <h2 className="connexion__carte-titre">Connexion</h2>
            <p className="connexion__carte-texte">Entrez votre identifiant et votre mot de passe.</p>
          </div>

          {!estConfigure ? (
            <p className="connexion__alerte">
              Le serveur n&apos;est pas configuré : renseignez VITE_APPWRITE_ENDPOINT et
              VITE_APPWRITE_PROJECT_ID dans le fichier .env.local, puis relancez l&apos;application.
            </p>
          ) : null}

          <div className="champ">
            <label htmlFor="identifiant">Nom d&apos;utilisateur</label>
            <input
              id="identifiant"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="EMK2"
              required
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              disabled={enCours || !estConfigure}
            />
          </div>

          <div className="champ">
            <label htmlFor="motDePasse">Mot de passe</label>
            <input
              id="motDePasse"
              type="password"
              autoComplete="current-password"
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              disabled={enCours || !estConfigure}
            />
          </div>

          <div className="champ">
            <label htmlFor="nomAppareil">
              Nom de cet appareil <span className="connexion__facultatif">facultatif</span>
            </label>
            <input
              id="nomAppareil"
              type="text"
              placeholder="PC caisse 3, téléphone rayon 51…"
              maxLength={60}
              value={nomAppareil}
              onChange={(e) => setNomAppareil(e.target.value)}
              disabled={enCours || !estConfigure}
            />
          </div>

          {erreur ? (
            <p className="connexion__erreur" role="alert">
              {erreur}
            </p>
          ) : null}

          <button
            type="submit"
            className="connexion__bouton"
            disabled={enCours || !estConfigure || !identifiant.trim() || !motDePasse}
          >
            {enCours ? 'Connexion…' : 'Se connecter'}
          </button>

          <p className="connexion__aide">Pas de compte ? Contactez l&apos;administrateur du rayon.</p>
        </form>
      </section>
    </div>
  );
}
