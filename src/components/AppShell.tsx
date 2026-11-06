import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { APP_NAME, APP_VERSION } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { LIBELLE_ROLE } from '../lib/auth';
import { LogoApp } from './LogoApp';
import './AppShell.css';

interface EntreeNavigation {
  readonly to: string;
  readonly libelle: string;
  readonly icone: ReactNode;
  /** Fonctionnalite non encore livree : l'entree reste visible mais desactivee. */
  readonly aVenir?: boolean;
  /** Entree masquee aux operateurs. */
  readonly reserveAdmin?: boolean;
  /** Groupe du menu lateral. */
  readonly section: 'Production' | 'Référentiel' | 'Administration';
}

const Icone = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const NAVIGATION: readonly EntreeNavigation[] = [
  {
    to: '/',
    section: 'Production',
    libelle: 'Tableau de bord',
    icone: (
      <Icone>
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </Icone>
    ),
  },
  {
    to: '/campagnes',
    section: 'Production',
    libelle: 'Campagnes',
    icone: (
      <Icone>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </Icone>
    ),
  },
  {
    to: '/affiches',
    section: 'Production',
    libelle: 'Affiches',
    icone: (
      <Icone>
        <rect x="5" y="2" width="14" height="20" rx="1.5" />
        <path d="M8 7h8M8 11h5" />
        <rect x="8" y="14" width="8" height="4" rx="0.5" />
      </Icone>
    ),
  },
  {
    to: '/marques',
    section: 'Référentiel',
    libelle: 'Marques',
    reserveAdmin: true,
    icone: (
      <Icone>
        <path d="M12 2 3 11v2l9 9 9-9V4h-9Z" />
        <circle cx="8.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
      </Icone>
    ),
  },
  {
    to: '/catalogue',
    section: 'Référentiel',
    libelle: 'Catalogue',
    icone: (
      <Icone>
        <path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2Z" />
        <path d="M11 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" />
      </Icone>
    ),
  },
  {
    to: '/journal',
    section: 'Administration',
    libelle: 'Journal',
    reserveAdmin: true,
    icone: (
      <Icone>
        <path d="M5 3h11l3 3v15H5z" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </Icone>
    ),
  },
  {
    to: '/parametres',
    section: 'Administration',
    libelle: 'Paramètres',
    reserveAdmin: true,
    icone: (
      <Icone>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
      </Icone>
    ),
  },
];

interface AppShellProps {
  readonly titre: string;
  readonly sousTitre?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/** Initiales affichees dans la pastille du compte. */
function initiales(nom: string): string {
  const mots = nom.trim().split(/[\s._-]+/).filter(Boolean);
  const lettres = mots.length > 1 ? mots[0][0] + mots[mots.length - 1][0] : nom.slice(0, 2);
  return lettres.toUpperCase();
}

const SECTIONS = ['Production', 'Référentiel', 'Administration'] as const;

/** Signature de l'auteur, affichee en bas du menu et sur l'ecran de connexion. */
export const AUTEUR = {
  nom: 'Mr NASSIRI ACHRAF',
  fonction: 'Manager de commerce',
  email: 'acnassiri@marjane.ma',
} as const;

export function Signature({ variante = 'menu' }: { variante?: 'menu' | 'connexion' | 'pied' }) {
  return (
    <div className={`signature signature--${variante}`}>
      <span className="signature__intro">Application conçue par</span>
      <span className="signature__nom">{AUTEUR.nom}</span>
      <span className="signature__fonction">{AUTEUR.fonction}</span>
      <a className="signature__email" href={`mailto:${AUTEUR.email}`}>
        {AUTEUR.email}
      </a>
    </div>
  );
}

export function AppShell({ titre, sousTitre, actions, children }: AppShellProps) {
  const { utilisateur, deconnexion } = useAuth();
  const entrees = NAVIGATION.filter(
    (entree) => !entree.reserveAdmin || utilisateur?.role === 'administrateur',
  );

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <NavLink to="/" className="shell__brand" aria-label={`${APP_NAME}, tableau de bord`}>
          <LogoApp taille={40} />
          <span className="shell__brand-text">
            <span className="shell__brand-name">Affiches EM</span>
            <span className="shell__brand-version">Marjane Kénitra 2 · v{APP_VERSION}</span>
          </span>
        </NavLink>

        <nav className="shell__nav" aria-label="Navigation principale">
          {SECTIONS.map((section) => {
            const liens = entrees.filter((e) => e.section === section);
            if (liens.length === 0) return null;
            return (
              <div key={section} className="shell__nav-groupe">
                <span className="shell__nav-section">{section}</span>
                {liens.map((entree) =>
                  entree.aVenir ? (
                    <span key={entree.to} className="shell__nav-link shell__nav-link--disabled">
                      <span className="shell__nav-icon">{entree.icone}</span>
                      {entree.libelle}
                    </span>
                  ) : (
                    <NavLink
                      key={entree.to}
                      to={entree.to}
                      end={entree.to === '/'}
                      className={({ isActive }) =>
                        isActive ? 'shell__nav-link shell__nav-link--active' : 'shell__nav-link'
                      }
                    >
                      <span className="shell__nav-icon">{entree.icone}</span>
                      {entree.libelle}
                    </NavLink>
                  ),
                )}
              </div>
            );
          })}
        </nav>

        <Signature variante="menu" />
      </aside>

      <div className="shell__main">
        <header className="shell__topbar">
          <div className="shell__titles">
            <h1 className="shell__title">{titre}</h1>
            {sousTitre ? <p className="shell__subtitle">{sousTitre}</p> : null}
          </div>
          {actions ? <div className="shell__actions">{actions}</div> : null}
          {utilisateur ? (
            <div className="shell__compte">
              <div className="shell__compte-infos">
                <span className="shell__compte-nom">{utilisateur.nom}</span>
                <span className="shell__compte-role">{LIBELLE_ROLE[utilisateur.role]}</span>
              </div>
              <span
                className="shell__compte-pastille"
                title={`${utilisateur.nom} (@${utilisateur.identifiant}) — ${LIBELLE_ROLE[utilisateur.role]}`}
                aria-hidden="true"
              >
                {initiales(utilisateur.nom)}
              </span>
              <button
                type="button"
                className="shell__deconnexion"
                onClick={() => void deconnexion()}
                title="Se déconnecter"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5M21 12H9" />
                </svg>
                <span className="visually-hidden">Se déconnecter</span>
              </button>
            </div>
          ) : null}
        </header>

        <main className="shell__content">{children}</main>

        <footer className="shell__pied">
          <Signature variante="pied" />
        </footer>
      </div>
    </div>
  );
}
