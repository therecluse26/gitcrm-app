# Development shell for NixOS: run `nix-shell`, then the npm scripts as usual.
# Playwright downloads its own Chromium, which expects the shared libraries of a typical Linux
# distribution. This shell puts those libraries on LD_LIBRARY_PATH.
{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = [ pkgs.nodejs_24 ];

  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (with pkgs; [
    alsa-lib
    at-spi2-core
    cairo
    cups
    dbus
    expat
    glib
    libgbm
    libx11
    libxcb
    libxcomposite
    libxdamage
    libxext
    libxfixes
    libxkbcommon
    libxrandr
    nspr
    nss
    pango
    systemdLibs
  ]);
}
