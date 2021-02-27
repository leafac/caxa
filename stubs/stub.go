package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"time"
)

func main() {
	executablePath, err := os.Executable()
	if err != nil {
		log.Fatalf("caxa stub: Failed to find self: %v", err)
	}

	executable, err := os.ReadFile(executablePath)
	if err != nil {
		log.Fatalf("caxa stub: Failed to read self: %v", err)
	}

	footerSeparator := []byte("\n")
	footerSeparatorIndex := bytes.LastIndex(executable, footerSeparator)
	if footerSeparatorIndex == -1 {
		log.Fatalf("caxa stub: Failed to find footer. (Did you append an archive and a footer to the stub?) %v", err)
	}
	footerString := executable[footerSeparatorIndex+len(footerSeparator):]
	var footer struct {
		Identifier string `json:"identifier"`
		Command    struct {
			File      string   `json:"file"`
			Arguments []string `json:"arguments"`
		} `json:"command"`
	}
	if err := json.Unmarshal(footerString, &footer); err != nil {
		log.Fatalf("caxa stub: Failed to parse JSON in footer: %v", err)
	}

	archiveSeparator := []byte(strings.Repeat("#", 10))
	archiveSeparatorIndex := bytes.Index(executable, archiveSeparator)
	if archiveSeparatorIndex == -1 {
		log.Fatalf("caxa stub: Failed to find archive separator. This is an error in how the stub was built: %v", err)
	}
	archive := executable[archiveSeparatorIndex+len(archiveSeparator) : footerSeparatorIndex]

	caxaDirectory := path.Join(os.TempDir(), "caxa", footer.Identifier)
	caxaDirectoryFileInfo, err := os.Stat(caxaDirectory)
	if err == nil || errors.Is(err, os.ErrExist) {
		if !caxaDirectoryFileInfo.IsDir() {
			log.Fatalf("caxa stub: caxa path already exists and it isn’t a directory: %v", err)
		}
	} else if err := Untar(bytes.NewReader(archive), caxaDirectory); err != nil {
		log.Fatalf("caxa stub: Failed to uncompress archive: %v", err)
	}

	cmd := exec.Command(footer.Command.File, append(footer.Command.Arguments, os.Args[1:]...)...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	// https://stackoverflow.com/questions/10385551/get-exit-code-go
	err = cmd.Run()
	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		os.Exit(exitError.ExitCode())
	} else if err != nil {
		log.Fatalf("caxa stub: Failed to run command: %v", err)
	}
	// // TODO: Extend PATH
	// Replace {{caxa}} placeholders
}

// Copied from https://github.com/golang/build/blob/db2c93053bcd6b944723c262828c90af91b0477a/internal/untar/untar.go

// Copyright 2017 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Package untar untars a tarball to disk.
// package untar

// import (
// 	"archive/tar"
// 	"compress/gzip"
// 	"fmt"
// 	"io"
// 	"log"
// 	"os"
// 	"path"
// 	"path/filepath"
// 	"strings"
// 	"time"
// )

// TODO(bradfitz): this was copied from x/build/cmd/buildlet/buildlet.go
// but there were some buildlet-specific bits in there, so the code is
// forked for now.  Unfork and add some opts arguments here, so the
// buildlet can use this code somehow.

// Untar reads the gzip-compressed tar file from r and writes it into dir.
func Untar(r io.Reader, dir string) error {
	return untar(r, dir)
}

func untar(r io.Reader, dir string) (err error) {
	t0 := time.Now()
	nFiles := 0
	madeDir := map[string]bool{}
	// defer func() {
	// 	td := time.Since(t0)
	// 	if err == nil {
	// 		log.Printf("extracted tarball into %s: %d files, %d dirs (%v)", dir, nFiles, len(madeDir), td)
	// 	} else {
	// 		log.Printf("error extracting tarball into %s after %d files, %d dirs, %v: %v", dir, nFiles, len(madeDir), td, err)
	// 	}
	// }()
	zr, err := gzip.NewReader(r)
	if err != nil {
		return fmt.Errorf("requires gzip-compressed body: %v", err)
	}
	tr := tar.NewReader(zr)
	loggedChtimesError := false
	for {
		f, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			// log.Printf("tar reading error: %v", err)
			return fmt.Errorf("tar error: %v", err)
		}
		if !validRelPath(f.Name) {
			return fmt.Errorf("tar contained invalid name error %q", f.Name)
		}
		rel := filepath.FromSlash(f.Name)
		abs := filepath.Join(dir, rel)

		fi := f.FileInfo()
		mode := fi.Mode()
		switch {
		case mode.IsRegular():
			// Make the directory. This is redundant because it should
			// already be made by a directory entry in the tar
			// beforehand. Thus, don't check for errors; the next
			// write will fail with the same error.
			dir := filepath.Dir(abs)
			if !madeDir[dir] {
				if err := os.MkdirAll(filepath.Dir(abs), 0755); err != nil {
					return err
				}
				madeDir[dir] = true
			}
			wf, err := os.OpenFile(abs, os.O_RDWR|os.O_CREATE|os.O_TRUNC, mode.Perm())
			if err != nil {
				return err
			}
			n, err := io.Copy(wf, tr)
			if closeErr := wf.Close(); closeErr != nil && err == nil {
				err = closeErr
			}
			if err != nil {
				return fmt.Errorf("error writing to %s: %v", abs, err)
			}
			if n != f.Size {
				return fmt.Errorf("only wrote %d bytes to %s; expected %d", n, abs, f.Size)
			}
			modTime := f.ModTime
			if modTime.After(t0) {
				// Clamp modtimes at system time. See
				// golang.org/issue/19062 when clock on
				// buildlet was behind the gitmirror server
				// doing the git-archive.
				modTime = t0
			}
			if !modTime.IsZero() {
				if err := os.Chtimes(abs, modTime, modTime); err != nil && !loggedChtimesError {
					// benign error. Gerrit doesn't even set the
					// modtime in these, and we don't end up relying
					// on it anywhere (the gomote push command relies
					// on digests only), so this is a little pointless
					// for now.
					// log.Printf("error changing modtime: %v (further Chtimes errors suppressed)", err)
					loggedChtimesError = true // once is enough
				}
			}
			nFiles++
		case mode.IsDir():
			if err := os.MkdirAll(abs, 0755); err != nil {
				return err
			}
			madeDir[abs] = true
		default:
			return fmt.Errorf("tar file entry %s contained unsupported file type %v", f.Name, mode)
		}
	}
	return nil
}

func validRelativeDir(dir string) bool {
	if strings.Contains(dir, `\`) || path.IsAbs(dir) {
		return false
	}
	dir = path.Clean(dir)
	if strings.HasPrefix(dir, "../") || strings.HasSuffix(dir, "/..") || dir == ".." {
		return false
	}
	return true
}

func validRelPath(p string) bool {
	if p == "" || strings.Contains(p, `\`) || strings.HasPrefix(p, "/") || strings.Contains(p, "../") {
		return false
	}
	return true
}
