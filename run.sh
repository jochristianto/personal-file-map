#! /usr/bin/env bash

COLOR_REST="$(tput sgr0)"
COLOR_GREEN="$(tput setaf 2)"
COLOR_MAGENTA="$(tput setaf 5)"

# Variables
printf '%s%s%s\n' $COLOR_GREEN '👀 Processing Variables' $COLOR_REST
YEAR=$(date +'%Y')
MAPPER_DIR="${HOME}/Developer/jochristianto/file-mapper"
TARGET_DIR="${HOME}/Library/CloudStorage/GoogleDrive-jo.christianto@gmail.com/My Drive/Bills/Monthly Bills/${YEAR}"
sleep .5
printf '%s%s%s\n\n' $COLOR_MAGENTA '-> All good 👍' $COLOR_REST

# Executing
printf '%s%s%s\n' $COLOR_GREEN 'Executing' $COLOR_REST
MAPPER_PATH="$TARGET_DIR" npx tsx "$MAPPER_DIR/index.ts"

$SHELL
