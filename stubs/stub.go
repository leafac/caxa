package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// TODO: Consider a simpler yet richer format for the payload:
// tar/base64 -> JSON with command-line options -> gzip
// https://stackoverflow.com/questions/1443158/binary-data-in-json-string-something-better-than-base64
// multipart form data
// asar
// WINNING IDEA: Just use a line of JSON before the archive!

// TODO: Include err in the error messages.
func main() {
	payloadSeparator := []byte(strings.Repeat("#", 10))
	archiveSeparator := []byte("\n")

	executablePath, err := os.Executable()
	if err != nil {
		panic("caxa stub: Failed to find self. This is a cathastrophic runtime error.")
	}

	// FIXME: Maybe don’t read the whole file?
	executable, err := ioutil.ReadFile(executablePath)
	if err != nil {
		panic("caxa stub: Failed to read self. This is a cathastrophic runtime error.")
	}

	payloadSeparatorIndex := bytes.Index(executable, payloadSeparator)
	if payloadSeparatorIndex == -1 {
		panic("caxa stub: Failed to find payload separator. This is an error in building the stub.")
	}
	payload := executable[payloadSeparatorIndex+len(payloadSeparator):]

	archiveSeparatorIndex := bytes.Index(payload, archiveSeparator)
	if archiveSeparatorIndex == -1 {
		panic("caxa stub: Failed to find archive separator. Did you append the command and the archive to the stub?")
	}
	command := string(payload[:archiveSeparatorIndex])
	archive := payload[archiveSeparatorIndex+len(archiveSeparator):]

	// TODO: Compute temporary directory path based on the contents of the archive.
	// TODO: Check if temporary directory exists and only untar if necessary.

	// Adapted from https://github.com/golang/build/blob/db2c93053bcd6b944723c262828c90af91b0477a/internal/untar/untar.go
	// More references:
	// https://stackoverflow.com/questions/57639648/how-to-decompress-tar-gz-file-in-go
	// https://gist.github.com/indraniel/1a91458984179ab4cf80
	// https://medium.com/@skdomino/taring-untaring-files-in-go-6b07cf56bc07
	// https://medium.com/learning-the-go-programming-language/working-with-compressed-tar-files-in-go-e6fe9ce4f51d
	// https://github.com/mholt/archiver
	// https://github.com/codeclysm/extract
	//
	// I decided to copy and paste instead of using a package for this to keep the build simple.
	gzippedArchiveReader, err := gzip.NewReader(bytes.NewReader(archive))
	if err != nil {
		panic("caxa stub: The archive isn’t a valid gzip.")
	}
	tarGzippedArchiveReader := tar.NewReader(gzippedArchiveReader)
	for {
		header, err := tarGzippedArchiveReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			panic("caxa stub: Failed to read tar.")
		}
		if header.Name == "" || strings.Contains(header.Name, `\`) || strings.HasPrefix(header.Name, "/") || strings.Contains(header.Name, "../") {
			panic("caxa stub: Tar contains invalid file name.")
		}
		// TODO: Use the temporary directory path here.
		entryPath := filepath.Join("untar", filepath.FromSlash(header.Name))
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(entryPath, 0755); err != nil {
				panic("caxa stub: Failed to create directory.")
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(entryPath), 0755); err != nil {
				panic("caxa stub: Failed to create directory.")
			}
			file, err := os.OpenFile(entryPath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, header.FileInfo().Mode().Perm())
			if err != nil {
				panic("caxa stub: Failed to open file.")
			}
			defer file.Close()
			written, err := io.Copy(file, tarGzippedArchiveReader)
			if err != nil || written != header.Size {
				panic("caxa stub: Failed to write file.")
			}
		default:
			panic("caxa stub: Tar contains unsupported file type.")
		}
	}

	// FIXME: Printing this just so Go doesn’t complain about unused variable
	// TODO: Extend PATH
	// TODO: Forward command-line parameters
	// TODO: Forward exit status
	// References:
	// https://groob.io/posts/golang-execve/
	// https://blog.kowalczyk.info/article/wOYk/advanced-command-execution-in-go-with-osexec.html
	// https://stackoverflow.com/questions/13008255/how-to-execute-a-simple-windows-command-in-golang
	// https://golang.org/pkg/syscall/
	// runtime.GOOS == "windows"
	syscall.Exec("/bin/ls", []string{"ls", "-la"}, os.Environ())
	fmt.Println(command)
}
