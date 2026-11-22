package patcher

import (
	"bytes"
	"encoding/hex"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"os"
)

type plistNode struct {
	tag        string
	start, end int
	text       string
	children   []*plistNode
}

func (n *plistNode) field(key string) (*plistNode, error) {
	if n.tag != "dict" || len(n.children)%2 != 0 {
		return nil, errors.New("Info.plist 字典结构无效")
	}
	var value *plistNode
	for j := 0; j < len(n.children); j += 2 {
		k := n.children[j]
		if k.tag != "key" || len(k.children) != 0 {
			return nil, errors.New("Info.plist 键结构无效")
		}
		if k.text == key {
			if value != nil {
				return nil, fmt.Errorf("Info.plist 键重复 %s", key)
			}
			value = n.children[j+1]
		}
	}
	if value == nil {
		return nil, fmt.Errorf("Info.plist 缺少键 %s", key)
	}
	return value, nil
}

// Retain all original XML bytes outside the single 64-byte hash value.
func updatePlist(path, previous, next string) ([]byte, error) {
	for _, h := range []string{previous, next} {
		if len(h) != 64 {
			return nil, errors.New("完整性摘要长度无效")
		}
		if _, err := hex.DecodeString(h); err != nil {
			return nil, err
		}
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, (4<<20)+1))
	if err != nil {
		return nil, err
	}
	if len(data) > 4<<20 {
		return nil, errors.New("Info.plist 过大")
	}
	root := &plistNode{}
	stack := []*plistNode{root}
	dec := xml.NewDecoder(bytes.NewReader(data))
	for {
		start := int(dec.InputOffset())
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		parent := stack[len(stack)-1]
		switch x := tok.(type) {
		case xml.StartElement:
			if len(stack) > 64 {
				return nil, errors.New("Info.plist 嵌套过深")
			}
			n := &plistNode{tag: x.Name.Local, start: int(dec.InputOffset())}
			parent.children = append(parent.children, n)
			stack = append(stack, n)
		case xml.EndElement:
			parent.end = start
			stack = stack[:len(stack)-1]
		case xml.CharData:
			if parent.tag == "key" || parent.tag == "string" {
				parent.text += string(x)
			}
		}
	}
	if len(root.children) != 1 || root.children[0].tag != "plist" || len(root.children[0].children) != 1 {
		return nil, errors.New("Info.plist 根无效")
	}
	n := root.children[0].children[0]
	for _, key := range []string{"ElectronAsarIntegrity", "Resources/app.asar"} {
		n, err = n.field(key)
		if err != nil {
			return nil, err
		}
	}
	algorithm, err := n.field("algorithm")
	if err != nil {
		return nil, err
	}
	if algorithm.tag != "string" || algorithm.text != "SHA256" {
		return nil, errors.New("ASAR 完整性算法不受支持")
	}
	h, err := n.field("hash")
	if err != nil {
		return nil, err
	}
	if h.tag != "string" || h.end-h.start != 64 || string(data[h.start:h.end]) != previous {
		return nil, errors.New("Info.plist 与现有 ASAR 头摘要不匹配")
	}
	copy(data[h.start:h.end], next)
	return data, nil
}
