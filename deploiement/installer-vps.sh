#!/usr/bin/env bash
# ============================================================================
# AFFICHES-EM — Installation du serveur (a lancer UNE SEULE FOIS sur le VPS)
# ----------------------------------------------------------------------------
# Ubuntu 22.04 / 24.04. Installe :
#   - PocketBase (base de donnees, comptes, fichiers) en service systemd,
#     ecoutant uniquement en local sur le port 8090 ;
#   - Caddy (site + certificat HTTPS automatique) qui sert l'application et
#     relaie /api et /_ (console d'administration) vers PocketBase ;
#   - le pare-feu (SSH, HTTP, HTTPS seulement).
#
# Envoye et lance par INSTALLER-SERVEUR.bat :
#   sudo bash /tmp/installer-vps.sh votre-domaine.com
# Les fichiers de structure (pb_migrations) doivent etre dans /tmp/pb_migrations.
# ============================================================================
set -euo pipefail

PB_VERSION="0.40.6"
DOMAINE="${1:-}"
DOSSIER_PB=/opt/pocketbase

if [ -z "$DOMAINE" ]; then
  echo "Usage : sudo bash installer-vps.sh votre-domaine.com"
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "Lancez ce script en root (ou avec sudo)."
  exit 1
fi

echo "==> Mise a jour du systeme"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl ufw unzip

# ---------------------------------------------------------------------------
echo "==> Installation de PocketBase $PB_VERSION"
case "$(uname -m)" in
  x86_64) ARCH=amd64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "Processeur non pris en charge : $(uname -m)"; exit 1 ;;
esac
id -u pocketbase >/dev/null 2>&1 || useradd --system --home "$DOSSIER_PB" --shell /usr/sbin/nologin pocketbase
mkdir -p "$DOSSIER_PB/pb_data" "$DOSSIER_PB/pb_migrations"
curl -fsSL -o /tmp/pocketbase.zip \
  "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${ARCH}.zip"
unzip -o -q /tmp/pocketbase.zip pocketbase -d "$DOSSIER_PB"
rm /tmp/pocketbase.zip
chmod 755 "$DOSSIER_PB/pocketbase"

if [ -d /tmp/pb_migrations ]; then
  cp /tmp/pb_migrations/*.js "$DOSSIER_PB/pb_migrations/"
  rm -rf /tmp/pb_migrations
fi
chown -R pocketbase:pocketbase "$DOSSIER_PB"

cat > /etc/systemd/system/pocketbase.service <<SERVICE
[Unit]
Description=PocketBase (Affiches EM)
After=network.target

[Service]
Type=simple
User=pocketbase
Group=pocketbase
LimitNOFILE=4096
Restart=always
RestartSec=5s
WorkingDirectory=$DOSSIER_PB
ExecStart=$DOSSIER_PB/pocketbase serve --http=127.0.0.1:8090 --dir=$DOSSIER_PB/pb_data --migrationsDir=$DOSSIER_PB/pb_migrations

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable pocketbase
systemctl restart pocketbase

echo "==> Attente du demarrage de PocketBase"
for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:8090/api/health >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS http://127.0.0.1:8090/api/health >/dev/null || { journalctl -u pocketbase -n 40 --no-pager; exit 1; }

# ---------------------------------------------------------------------------
echo ""
echo "==> Compte super-administrateur PocketBase"
echo "    (sert a la console https://$DOMAINE/_/ et aux scripts COMPTES / MIGRER)"
read -r -p "    E-mail : " PB_EMAIL
while :; do
  read -r -s -p "    Mot de passe (10 caracteres minimum) : " PB_MDP; echo
  read -r -s -p "    Confirmez le mot de passe            : " PB_MDP2; echo
  if [ "$PB_MDP" != "$PB_MDP2" ]; then echo "    Les deux saisies different, recommencez."; continue; fi
  if [ "${#PB_MDP}" -lt 10 ]; then echo "    Trop court, recommencez."; continue; fi
  break
done
sudo -u pocketbase "$DOSSIER_PB/pocketbase" superuser upsert "$PB_EMAIL" "$PB_MDP" --dir="$DOSSIER_PB/pb_data"
unset PB_MDP PB_MDP2

# ---------------------------------------------------------------------------
echo "==> Installation de Caddy"
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

mkdir -p /var/www/affiches
if [ ! -f /var/www/affiches/index.html ]; then
  echo '<!doctype html><meta charset="utf-8"><title>Affiches EM</title><p style="font-family:sans-serif">Serveur pret. Lancez DEPLOYER.bat depuis votre PC.</p>' > /var/www/affiches/index.html
fi

echo "==> Configuration de Caddy pour $DOMAINE"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAINE {
	encode zstd gzip

	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
	}

	# Base de donnees, comptes, fichiers et console d'administration
	handle /api/* {
		request_body {
			max_size 20MB
		}
		reverse_proxy 127.0.0.1:8090
	}
	handle /_/* {
		reverse_proxy 127.0.0.1:8090
	}

	# Application
	handle {
		root * /var/www/affiches
		@frais path / /index.html /sw.js /registerSW.js /manifest.webmanifest
		header @frais Cache-Control "no-cache"
		@assets path /assets/*
		header @assets Cache-Control "public, max-age=31536000, immutable"
		header X-Frame-Options "DENY"
		file_server
	}
}
CADDY
caddy fmt --overwrite /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

echo "==> Pare-feu (SSH, HTTP, HTTPS)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "Termine."
echo "  - Application         : https://$DOMAINE"
echo "  - Console PocketBase  : https://$DOMAINE/_/"
echo "  - Sauvegarde auto     : chaque nuit a 3 h (7 jours conserves)"
echo "Le certificat HTTPS est obtenu automatiquement des que le domaine pointe"
echo "vers l'adresse IP de ce serveur."
