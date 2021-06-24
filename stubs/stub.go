package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

func main() {
	executableFile, err := os.Executable()
	if err != nil {
		log.Fatalf("caxa stub: Failed to find executable: %v", err)
	}

	executable, err := os.ReadFile(executableFile)
	if err != nil {
		log.Fatalf("caxa stub: Failed to read executable: %v", err)
	}

	footerSeparator := []byte("\n")
	footerIndex := bytes.LastIndex(executable, footerSeparator)
	if footerIndex == -1 {
		log.Fatalf("caxa stub: Failed to find footer (did you append an archive and a footer to the stub?): %v", err)
	}
	footerString := executable[footerIndex+len(footerSeparator):]
	var footer struct {
		Identifier           string   `json:"identifier"`
		Command              []string `json:"command"`
		UncompressionMessage string   `json:"uncompressionMessage"`
	}
	if err := json.Unmarshal(footerString, &footer); err != nil {
		log.Fatalf("caxa stub: Failed to parse JSON in footer: %v", err)
	}

	var applicationDirectory string
	for extractionAttempt := 0; true; extractionAttempt++ {
		lock := path.Join(os.TempDir(), "caxa/locks", footer.Identifier, strconv.Itoa(extractionAttempt))
		applicationDirectory = path.Join(os.TempDir(), "caxa/applications", footer.Identifier, strconv.Itoa(extractionAttempt))
		applicationDirectoryFileInfo, err := os.Stat(applicationDirectory)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Fatalf("caxa stub: Failed to find information about the application directory: %v", err)
		}
		if err == nil && !applicationDirectoryFileInfo.IsDir() {
			log.Fatalf("caxa stub: Path to application directory already exists and isn’t a directory: %v", err)
		}
		if err == nil && applicationDirectoryFileInfo.IsDir() {
			lockFileInfo, err := os.Stat(lock)
			if err != nil && !errors.Is(err, os.ErrNotExist) {
				log.Fatalf("caxa stub: Failed to find information about the lock: %v", err)
			}
			if err == nil && !lockFileInfo.IsDir() {
				log.Fatalf("caxa stub: Path to lock already exists and isn’t a directory: %v", err)
			}
			if err == nil && lockFileInfo.IsDir() {
				// Application directory exists and lock exists as well, so a previous extraction wasn’t successful or an extraction is happening right now and hasn’t finished yet, in either case, start over with a fresh name.
				continue
			}
			if err != nil && errors.Is(err, os.ErrNotExist) {
				// Application directory exists and lock doesn’t exist, so a previous extraction was successful. Use the cached version of the application directory and don’t extract again.
				break
			}
		}
		if err != nil && errors.Is(err, os.ErrNotExist) {
			ctx, cancelCtx := context.WithCancel(context.Background())
			if footer.UncompressionMessage != "" {
				fmt.Fprint(os.Stderr, footer.UncompressionMessage)
				go func() {
					ticker := time.NewTicker(time.Second * 5)
					defer ticker.Stop()
					for {
						select {
						case <-ticker.C:
							fmt.Fprint(os.Stderr, ".")
						case <-ctx.Done():
							fmt.Fprintln(os.Stderr, "")
							return
						}
					}
				}()
			}

			if err := os.MkdirAll(lock, 0755); err != nil {
				log.Fatalf("caxa stub: Failed to create the lock directory: %v", err)
			}

			// The use of ‘Repeat’ below is to make it even more improbable that the separator will appear literally in the compiled stub.
			archiveSeparator := []byte("\n" + strings.Repeat("CAXA", 3) + "\n")
			archiveIndex := bytes.Index(executable, archiveSeparator)
			if archiveIndex == -1 {
				log.Fatalf("caxa stub: Failed to find archive (did you append the separator when building the stub?): %v", err)
			}
			archive := executable[archiveIndex+len(archiveSeparator) : footerIndex]

			if err := Untar(bytes.NewReader(archive), applicationDirectory); err != nil {
				log.Fatalf("caxa stub: Failed to uncompress archive: %v", err)
			}

			os.Remove(lock)

			cancelCtx()
			break
		}
	}

	expandedCommand := make([]string, len(footer.Command))
	applicationDirectoryPlaceholderRegexp := regexp.MustCompile(`\{\{\s*caxa\s*\}\}`)
	for key, commandPart := range footer.Command {
		expandedCommand[key] = applicationDirectoryPlaceholderRegexp.ReplaceAllLiteralString(commandPart, applicationDirectory)
	}

	command := exec.Command(expandedCommand[0], append(expandedCommand[1:], os.Args[1:]...)...)
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	err = command.Run()
	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		os.Exit(exitError.ExitCode())
	} else if err != nil {
		log.Fatalf("caxa stub: Failed to run command: %v", err)
	}
}

// Adapted from https://github.com/golang/build/blob/db2c93053bcd6b944723c262828c90af91b0477a/internal/untar/untar.go and https://github.com/mholt/archiver/tree/v3.5.0

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
		case f.Typeflag == tar.TypeSymlink:
			// leafac: Added by me to support symbolic links. Adapted from https://github.com/mholt/archiver/blob/v3.5.0/tar.go#L254-L276 and https://github.com/mholt/archiver/blob/v3.5.0/archiver.go#L313-L332
			err := os.MkdirAll(filepath.Dir(abs), 0755)
			if err != nil {
				return fmt.Errorf("%s: making directory for file: %v", abs, err)
			}
			_, err = os.Lstat(abs)
			if err == nil {
				err = os.Remove(abs)
				if err != nil {
					return fmt.Errorf("%s: failed to unlink: %+v", abs, err)
				}
			}

			err = os.Symlink(f.Linkname, abs)
			if err != nil {
				return fmt.Errorf("%s: making symbolic link for: %v", abs, err)
			}
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
