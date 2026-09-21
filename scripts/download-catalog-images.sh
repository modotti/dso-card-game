#!/bin/zsh
set -euo pipefail
target_dir="src/assets/cards"
temp_dir="${TMPDIR:-/tmp}/dso-catalog-images"
mkdir -p "$target_dir" "$temp_dir"
download() { curl -sS -L "$2" -o "$temp_dir/$1.jpg"; sips -Z 1000 -s format jpeg -s formatOptions 78 "$temp_dir/$1.jpg" --out "$target_dir/$1.jpg" >/dev/null; }
nasa() { download "$1" "https://images-assets.nasa.gov/image/$2/$2~$3.jpg"; }
sky() { download "$1" "https://alasky.u-strasbg.fr/hips-image-services/hips2fits?hips=CDS%2FP%2FDSS2%2Fcolor&width=900&height=900&fov=$4&projection=TAN&coordsys=icrs&ra=$2&dec=$3&format=jpg"; }
nasa m33 PIA11969 medium
download m63 'https://science.nasa.gov/wp-content/uploads/2023/04/potw1536a-jpg.webp'
download m64 'https://assets.science.nasa.gov/content/dam/science/missions/hubble/galaxies/spiral/Hubble_M64_UVIS_V4_flat_HST_FINAL2_NewImage.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg'
download m81 'https://science.nasa.gov/wp-content/uploads/2023/04/m81-print-jpg.webp'
nasa m82 PIA18841 medium
nasa m83 PIA10374 medium
nasa m87 PIA23122 medium
nasa m101 PIA15630 medium
download m17 'https://science.nasa.gov/wp-content/uploads/2017/10/m17-field2-f110wf160w-a1-final-vers1.jpg'
download m20 'https://assets.science.nasa.gov/content/dam/science/missions/hubble/nebulae/emission/hubble_2026_trifid.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg'
nasa ngc2237 PIA09268 thumb
nasa ngc3372 carina_nebula medium
nasa ngc7000 PIA13845 medium
nasa m11 PIA07878 small
download m35 'https://assets.science.nasa.gov/content/dam/science/missions/hubble/stars/open-clusters/Hubble_M35_WFPC2ok_flat_FINAL1.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg'
sky m36 84.075 34.14 0.55
sky m37 88.075 32.55 0.65
download m44 'https://science.nasa.gov/wp-content/uploads/2024/08/m44-acs-1-color-2-final-sm.jpg'
download m46 'https://science.nasa.gov/wp-content/uploads/2023/04/hubble_ngc2438_wfpc2_screen_3mb.png'
sky m47 114.15 -14.5 0.65
nasa m2 PIA04926 small
download m3 'https://assets.science.nasa.gov/content/dam/science/missions/hubble/stars/globular-clusters/Hubble_M3_2019_potw1914a.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg'
nasa m4 PIA04231 small
download m5 'https://assets.science.nasa.gov/content/dam/science/missions/hubble/stars/globular-clusters/Hubble_M5_WFC3_UV_flat_FINAL_NewImage.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg'
download m13 'https://assets.science.nasa.gov/content/dam/science/missions/hubble/stars/globular-clusters/Hubble_M13_2010_potw1011a.jpg/jcr:content/renditions/cq5dam.web.1280.1280.jpeg'
download m15 'https://science.nasa.gov/wp-content/uploads/2023/04/heic1321a-jpg.webp'
nasa m22 PIA04202 thumb
download m55 'https://science.nasa.gov/wp-content/uploads/2023/06/hubble-m55-mos-acs-long-flat-final2-jpg.webp'
nasa m27 PIA04249 small
download m76 'https://science.nasa.gov/wp-content/uploads/2024/04/hubble-34th-littledumbell-sm-stsci-01htddrc7nr68q120setwhmsaq.png'
sky m97 168.7 55.02 0.2
sky ngc2392 112.29 20.91 0.08
nasa ngc6543 PIA16009 medium
download m78 'https://science.nasa.gov/wp-content/uploads/2023/04/m78_0-jpg.webp'
sky ngc1977 83.83 -4.84 0.5
nasa ngc7023 PIA17015 small
sky ngc2023 85.45 -2.26 0.3
sky b33 85.25 -2.46 0.35
sky b72 258.1 -23.63 0.45
sky coalsack 192.5 -62.5 3.5
