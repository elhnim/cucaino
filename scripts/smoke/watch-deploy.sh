#!/usr/bin/env bash
# Wait for the cucaino production deploy of a given commit to go live, then run the backfill.
SHA="$1"
SITE="1dab7afb-cd6d-47f6-8cee-266d4fa38658"
cd "C:\Users\MinhHoang\OneDrive - Haverton Homes\4.Personal\13.Claude Projects\kids-app" || exit 1
for i in $(seq 1 30); do
  state=$(netlify api listSiteDeploys --data "{\"site_id\":\"$SITE\",\"per_page\":1}" 2>/dev/null \
    | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const x=JSON.parse(d)[0];console.log((x.commit_ref||'').slice(0,7), x.state)})")
  sha=$(echo "$state" | cut -d' ' -f1)
  st=$(echo "$state" | cut -d' ' -f2)
  if [ "$sha" = "${SHA:0:7}" ] && [ "$st" = "ready" ]; then
    echo "DEPLOY READY: $state"
    exit 0
  fi
  if [ "$st" = "error" ]; then
    echo "DEPLOY FAILED: $state"
    exit 1
  fi
  sleep 15
done
echo "TIMEOUT waiting for deploy (last: $state)"
exit 1
