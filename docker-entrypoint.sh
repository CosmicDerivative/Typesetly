#!/bin/sh
set -eu

auth_config=/etc/nginx/typesetly-auth.inc
password_file=/etc/nginx/.typesetly-htpasswd
enabled=$(printf '%s' "${TYPESETLY_LOGIN_ENABLED:-false}" | tr '[:upper:]' '[:lower:]')

case "$enabled" in
  true|1|yes|on)
    username=${TYPESETLY_LOGIN_USERNAME:-}
    password=${TYPESETLY_LOGIN_PASSWORD:-}

    if [ -z "$username" ] || [ -z "$password" ]; then
      echo "Typesetly web login is enabled, but its username or password is empty." >&2
      exit 1
    fi

    case "$username" in
      *:*)
        echo "TYPESETLY_LOGIN_USERNAME cannot contain a colon." >&2
        exit 1
        ;;
    esac

    # -i reads the password from stdin so it is not exposed in the process list.
    printf '%s\n' "$password" | htpasswd -i -B -c "$password_file" "$username" >/dev/null
    # nginx workers run as the unprivileged `nginx` user and must be able to read this file.
    chown root:nginx "$password_file" 2>/dev/null || chown root:www-data "$password_file" 2>/dev/null || true
    chmod 640 "$password_file"
    cat > "$auth_config" <<EOF
auth_basic "Typesetly";
auth_basic_user_file $password_file;
EOF
    chmod 644 "$auth_config"
    ;;
  false|0|no|off|'')
    rm -f "$password_file"
    : > "$auth_config"
    ;;
  *)
    echo "TYPESETLY_LOGIN_ENABLED must be true or false (also accepts 1/0, yes/no, on/off)." >&2
    exit 1
    ;;
esac

exec /docker-entrypoint.sh "$@"
